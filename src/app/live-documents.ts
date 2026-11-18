import {
	CANVAS_ONLY_TYPES,
	type Note,
	parseNote,
	serializeNote,
} from "../core/note-format";
import {
	type DocumentRow,
	indexDocumentIds,
} from "../core/notes/document-identity";
import { movedPath, within } from "../core/notes/folders";
import { buildRecoveryText } from "../core/session/recovery";
import type { Autosave, AutosaveState } from "../editor/autosave";
import { BLOCK_TYPES } from "../editor/blocks";
import { blocksToDoc, checkBlocks } from "../editor/doc-blocks";
import { allowEditing, type OpenedNote } from "../editor/note-io";
import type { Draft } from "../editor/save-draft";
import type { DraftAutosaveOwner, SavedInfo } from "../editor/useAutosave";
import { type Host, HostError } from "../host/host";
import { READ_ONLY_VAULT_MESSAGE } from "../host/read-only-host";

export type DocumentTarget = { path: string } | { noteId: string };

export interface LiveDocument {
	readonly noteId: string | null;
	readonly path: string;
	readonly kind: "note" | "canvas";
	readonly readOnly: boolean;
	/** Last validated version and the exact file text it was read from. */
	readonly base: Note | null;
	readonly diskText: string;
	/** Treat both versions as snapshots. A damaged draft holds any readable blocks. */
	readonly draft: Note | null;
	readonly revision: number;
	readonly saveStatus: AutosaveState;
	readonly editorOwner: symbol | null;
	readonly opened?: OpenedNote;
	readonly editorDraft?: Draft;
	readonly lastSave?: SavedInfo;
}

type Listener = (document: LiveDocument, reloaded: boolean) => void;
interface Entry {
	path: string;
	document: LiveDocument | null;
	ready: Promise<void>;
	editorReady?: Promise<void>;
	autosave?: Autosave<Draft>;
	subscribers: Map<symbol, Listener | undefined>;
}

function isDirty({ document }: Entry) {
	return document !== null && document.saveStatus.kind !== "saved";
}

const canvasTypes = new Set<string>([...BLOCK_TYPES, ...CANVAS_ONLY_TYPES]);

function openedDocument(
	path: string,
	diskText: string,
	indexedPaths: ReadonlyMap<string, string>,
	writable: boolean,
): LiveDocument {
	const { note, problems } = parseNote(diskText);
	const kind = note?.header.kind === "canvas" ? "canvas" : "note";
	const base =
		note &&
		problems.length === 0 &&
		(kind === "canvas"
			? note.blocks.every((block) => canvasTypes.has(block.type))
			: checkBlocks(note.blocks).ok)
			? note
			: null;
	const id = base?.header.noteId;
	const noteId = id && indexedPaths.get(id) === path ? id : null;
	return {
		noteId,
		path,
		kind,
		readOnly: !writable || noteId === null,
		base,
		diskText,
		draft: note,
		revision: 0,
		saveStatus: { kind: "saved" },
		editorOwner: null,
	};
}

/** One registry per vault generation. Dispose it before the host switches vaults. */
export function createLiveDocuments(
	host: Pick<Host, "readText">,
	{ notes, writable }: { notes: readonly DocumentRow[]; writable: boolean },
	editor?: {
		open(path: string, diskText?: string): Promise<OpenedNote>;
		onSaved(info: SavedInfo): void;
	},
) {
	let indexedPaths = indexDocumentIds(notes);
	const entries = new Map<string, Entry>();
	let disposed = false;
	let tail: Promise<unknown> | null = null;

	function run<T>(task: () => Promise<T>) {
		const result = tail ? tail.then(task) : task();
		const done = result.catch(() => {});
		tail = done;
		void done.then(() => {
			if (tail === done) tail = null;
		});
		return result;
	}

	function canMove(from: string, to: string) {
		for (const path of entries.keys())
			if (within(path, to) && !within(path, from)) return false;
		return true;
	}

	function guardMoves(
		host: Host,
		moved?: (from: string, to: string) => void,
	): Host {
		return new Proxy(host, {
			get(target, key, receiver) {
				if (key === "move")
					return async (from: string, to: string) => {
						if (!canMove(from, to))
							throw new Error("A note at the destination is still in use.");
						await target.move(from, to);
						moved?.(from, to);
					};
				const value = Reflect.get(target, key, receiver);
				return typeof value === "function" ? value.bind(target) : value;
			},
		});
	}

	function fromOpened(opened: OpenedNote) {
		const { path, baseText } = opened;
		const id = opened.note?.header.noteId;
		if (id && opened.editable) indexedPaths.set(id, path);
		else if (id && indexedPaths.get(id) === path) indexedPaths.delete(id);
		return {
			...openedDocument(path, baseText ?? "", indexedPaths, writable),
			opened,
		};
	}

	function load(path: string, opened?: OpenedNote, passive = false): Entry {
		const entry: Entry = {
			path,
			document: opened ? fromOpened(opened) : null,
			subscribers: new Map(),
			ready: Promise.resolve(),
		};
		entries.set(path, entry);
		if (!opened)
			entry.ready = run(async () => {
				const path = entry.path;
				if (entries.get(path) !== entry) return;
				const value = await (!passive && editor
					? editor.open(path)
					: host.readText(path));
				if (entries.get(path) !== entry) return;
				entry.document =
					typeof value === "string"
						? openedDocument(path, value, indexedPaths, writable)
						: fromOpened(value);
			});
		if (!passive) entry.editorReady = entry.ready;
		return entry;
	}

	function prepareEditor(entry: Entry) {
		if (!editor || entry.editorReady) return entry.editorReady ?? entry.ready;
		// A passive view may already have read the bytes. Prepare the pane once
		// from those same bytes, with the usual editor safety checks.
		const ready = run(async () => {
			await entry.ready;
			const { path, document } = entry;
			if (!document || entries.get(path) !== entry) return;
			const opened = await editor.open(path, document.diskText);
			const latest = entry.document;
			if (entries.get(path) !== entry || !latest) return;
			const { noteId, readOnly } = fromOpened(opened);
			publish(entry, { ...latest, noteId, readOnly, opened });
		});
		entry.editorReady = ready;
		void ready.catch(() => {
			entry.editorReady = undefined;
		});
		return ready;
	}

	function publish(entry: Entry, document: LiveDocument, reloaded = false) {
		entry.document = document;
		for (const listener of entry.subscribers.values()) {
			if (entry.document !== document) break;
			listener?.(document, reloaded);
		}
	}

	function evictCleanEntry(entry: Entry) {
		if (isDirty(entry)) return;
		const evict = () => {
			const key = entry.path;
			if (
				entry.subscribers.size === 0 &&
				!isDirty(entry) &&
				entries.get(key) === entry
			) {
				entry.autosave?.dispose();
				entries.delete(key);
			}
		};
		// Discard can mark an entry saved before an admitted write finishes.
		// Leave the queue in the registry until that write has settled.
		if (entry.autosave) void entry.autosave.flush().then(evict);
		else evict();
	}

	/** `ready` supplies the initial snapshot. The listener receives later changes. */
	function subscribe(
		target: DocumentTarget,
		onChange?: Listener,
		opened?: OpenedNote,
		passive = false,
	) {
		const id = "noteId" in target ? target.noteId : null;
		const path =
			"path" in target ? target.path : indexedPaths.get(target.noteId);
		const entry =
			disposed || path === undefined
				? null
				: (entries.get(path) ?? load(path, opened, passive));
		const subscriber = Symbol();
		entry?.subscribers.set(subscriber, undefined);

		function unsubscribe() {
			if (!entry || path === undefined || !entry.subscribers.delete(subscriber))
				return;
			const document = entry.document;
			if (document?.editorOwner === subscriber)
				publish(entry, { ...document, editorOwner: null });
			if (!entry.subscribers.size) evictCleanEntry(entry);
		}

		function current() {
			const document = entry?.document;
			return document &&
				entry.subscribers.has(subscriber) &&
				(id === null ||
					(document.noteId === id && indexedPaths.get(id) === document.path))
				? document
				: null;
		}

		if (entry && current()) entry.subscribers.set(subscriber, onChange);
		const ready = entry
			? (passive ? entry.ready : prepareEditor(entry)).then(
					() => {
						const document = current();
						if (document) entry.subscribers.set(subscriber, onChange);
						else unsubscribe();
						return document;
					},
					(error: unknown) => {
						if (!entry.subscribers.has(subscriber)) return null;
						unsubscribe();
						throw error;
					},
				)
			: Promise.resolve(null);

		const autosave: DraftAutosaveOwner["autosave"] = (create) => {
			const document = current();
			if (!entry || !writable || !document?.opened?.editable || !editor)
				return null;
			if (entry.autosave) return entry.autosave;
			const auto = create((saved, draft, info) => {
				const latest = entry.document;
				if (disposed || !latest || entries.get(latest.path) !== entry) return;
				const { note, path } = saved;
				const noteId = note?.header.noteId ?? null;
				entries.delete(latest.path);
				entry.path = path;
				entries.set(path, entry);
				if (noteId) indexedPaths.set(noteId, path);
				publish(entry, {
					...latest,
					path,
					noteId,
					opened: saved,
					base: note,
					diskText: saved.baseText ?? "",
					draft: latest.editorDraft === draft ? note : latest.draft,
					lastSave: info,
				});
				editor.onSaved(info);
			});
			auto.subscribe((saveStatus) => {
				const latest = entry.document;
				if (disposed || !latest || entries.get(latest.path) !== entry) return;
				publish(entry, { ...latest, saveStatus });
				if (saveStatus.kind === "saved" && !entry.subscribers.size)
					evictCleanEntry(entry);
			});
			const change = auto.change;
			auto.change = (editorDraft) => {
				const latest = entry.document;
				if (disposed || !writable || !latest) return;
				entry.document = {
					...latest,
					editorDraft,
					revision: latest.revision + 1,
				};
				change(editorDraft);
				if (entry.document.saveStatus === latest.saveStatus)
					publish(entry, entry.document);
			};
			entry.autosave = auto;
			return auto;
		};

		const write: DraftAutosaveOwner["write"] = (host, save) =>
			run(async () => {
				const document = entry?.document;
				if (!writable || !document?.opened)
					return {
						ok: false,
						message: READ_ONLY_VAULT_MESSAGE,
						conflict: true,
					};
				if (
					document.noteId &&
					indexedPaths.get(document.noteId) !== document.path
				)
					return {
						ok: false,
						message: "This note changed on disk since you opened it.",
						conflict: true,
					};
				return save(guardMoves(host), document.opened);
			});
		return {
			ready,
			current,
			unsubscribe,
			autosave,
			write,
			unlock() {
				const document = current();
				if (!writable || !entry || !document?.opened) return null;
				const opened = allowEditing(document.opened);
				publish(entry, { ...document, opened });
				return opened;
			},
			reload(next: OpenedNote) {
				const document = current();
				if (!entry || !document || document.saveStatus.kind !== "saved")
					return null;
				entry.autosave?.dispose();
				entry.autosave = undefined;
				publish(
					entry,
					{
						...fromOpened(next),
						revision: document.revision + 1,
					},
					true,
				);
				return entry.document;
			},
			updateDraft(draft: Note) {
				const document = current();
				if (!entry || !document || document.readOnly) return false;
				if (
					draft.header.noteId !== document.noteId ||
					draft.header.kind !== document.base?.header.kind
				)
					return false;
				publish(entry, {
					...document,
					draft,
					revision: document.revision + 1,
					saveStatus: { kind: "dirty" },
				});
				return true;
			},
			setEditorOwner(owns: boolean) {
				const document = current();
				if (!entry || !document || document.readOnly) return false;
				const owner = document.editorOwner;
				if (owner !== null && owner !== subscriber) return false;
				const next = owns ? subscriber : null;
				if (owner !== next) publish(entry, { ...document, editorOwner: next });
				return true;
			},
		};
	}

	function rekey(from: string, to: string) {
		if (from === to) return;
		for (const [id, path] of indexedPaths)
			indexedPaths.set(id, movedPath(path, from, to));
		for (const [oldPath, entry] of [...entries]) {
			const path = movedPath(oldPath, from, to);
			if (path === oldPath) continue;
			entries.delete(oldPath);
			entry.path = path;
			entries.set(path, entry);
			const document = entry.document;
			if (document)
				publish(entry, {
					...document,
					path,
					opened: document.opened && { ...document.opened, path },
					lastSave: undefined,
				});
		}
	}

	async function refresh(
		notes: readonly DocumentRow[],
		renamed: (from: string, to: string) => void,
	) {
		const index = indexDocumentIds(notes);
		const paths = new Set(notes.map((row) => row.path));
		const read = (path: string) =>
			host.readText(path).catch((error: unknown) => {
				if (error instanceof HostError && error.code === "not-found")
					return null;
				throw error;
			});
		const updates = await Promise.all(
			[...entries.values()].map(async (entry) => {
				const document = entry.document;
				if (!document) return;
				const { path, noteId, diskText } = document;
				try {
					const text = await read(path);
					const candidate = noteId && index.get(noteId);
					if (
						candidate &&
						candidate !== path &&
						!paths.has(path) &&
						canMove(path, candidate) &&
						(text === null || within(candidate, path)) &&
						(await read(candidate)) === diskText
					)
						return () => {
							if (!canMove(path, candidate)) return;
							rekey(path, candidate);
							renamed(path, candidate);
						};
					if (text === diskText && (!noteId || index.get(noteId) === path))
						return;
					const opened =
						text !== null && document.opened && !isDirty(entry)
							? await editor?.open(path)
							: undefined;
					return () => {
						const latest = entry.document;
						if (!latest || entries.get(path) !== entry) return;
						if (isDirty(entry)) {
							const reason =
								text === null
									? "This note was moved or deleted outside the app."
									: "This note changed on disk since you opened it.";
							if (entry.autosave) entry.autosave.reportConflict(reason);
							else
								publish(entry, {
									...latest,
									saveStatus: { kind: "failed", reason, conflict: true },
								});
						} else if (text !== null && (opened || !latest.opened)) {
							entry.autosave?.dispose();
							entry.autosave = undefined;
							publish(
								entry,
								{
									...(opened
										? fromOpened(opened)
										: openedDocument(path, text, index, writable)),
									revision: latest.revision + 1,
								},
								true,
							);
						}
					};
				} catch {
					// Keep the current version when the file could not be read.
				}
			}),
		);
		if (disposed) return false;
		indexedPaths = index;
		for (const update of updates) update?.();
		return true;
	}

	return {
		subscribe,
		subscribePassive: (noteId: string, onChange: Listener) =>
			subscribe({ noteId }, onChange, undefined, true),
		setNotes(notes: readonly DocumentRow[]) {
			indexedPaths = indexDocumentIds(notes);
		},
		run,
		guardMoves,
		hasDrafts: () => [...entries.values()].some(isDirty),
		rekey,
		refresh,
		renameDraft(path: string, title: string) {
			const entry = entries.get(path);
			const draft = entry?.document?.editorDraft;
			if (!entry?.autosave || !draft || !isDirty(entry)) return;
			entry.autosave.change({ ...draft, title });
			return entry.autosave.flush();
		},
		setWritable(next: boolean) {
			if (disposed || writable === next) return;
			writable = next;
			for (const entry of entries.values()) {
				const document = entry.document;
				if (document)
					publish(entry, {
						...document,
						readOnly: !writable || document.noteId === null,
					});
			}
		},
		async flushAll() {
			do {
				const results = await Promise.all(
					[...entries.values()].map(async (entry) => {
						const saved = await entry.autosave?.flush();
						return saved !== false && !isDirty(entry);
					}),
				);
				if (!results.every(Boolean)) return false;
				// Another entry may have received an edit while a slower one saved.
			} while ([...entries.values()].some(isDirty));
			return true;
		},
		recoveryTexts(now: Date) {
			const texts = new Map<string, string>();
			for (const { document } of entries.values()) {
				if (!document || document.saveStatus.kind === "saved") continue;
				const { path, editorDraft, base, draft, opened, kind } = document;
				const header = (base ?? opened?.note ?? draft)?.header;
				const id = document.noteId ?? header?.noteId;
				if (id === undefined || texts.has(id)) continue;
				if (!editorDraft && !draft) continue;
				const title = editorDraft?.title ?? draft?.header.title;
				const body = editorDraft
					? { doc: editorDraft.doc }
					: draft && kind === "canvas"
						? { jsonl: serializeNote(draft) }
						: { doc: blocksToDoc(draft?.blocks ?? []) };
				texts.set(
					id,
					buildRecoveryText({
						path,
						now,
						title: typeof title === "string" ? title : path,
						props: editorDraft
							? (editorDraft.props ?? header?.props)
							: draft?.header.props,
						...body,
					}),
				);
			}
			return [...texts.values()];
		},
		dispose() {
			disposed = true;
			for (const entry of entries.values()) {
				// Save anything still unsaved before stopping, as a pane switch
				// always did, so replacing the registry never discards an edit.
				const auto = entry.autosave;
				if (auto) void auto.flush().finally(() => auto.dispose());
				entry.subscribers.clear();
			}
			entries.clear();
		},
	};
}

export type LiveDocuments = ReturnType<typeof createLiveDocuments>;
