import {
	CANVAS_ONLY_TYPES,
	type Note,
	parseNote,
	serializeNote,
} from "../core/note-format";
import {
	CanvasConflict,
	inOrder,
	prepareCanvasEdit,
	writeCanvasTextLocked,
} from "../core/notes/canvas-edit";
import {
	type DocumentRow,
	indexDocumentIds,
} from "../core/notes/document-identity";
import { movedPath, within } from "../core/notes/folders";
import { type RenameResult, renameSavedNote } from "../core/notes/rename";
import { buildRecoveryText } from "../core/session/recovery";
import type { Autosave, AutosaveState } from "../editor/autosave";
import { BLOCK_TYPES } from "../editor/blocks";
import { blocksToDoc, checkBlocks } from "../editor/doc-blocks";
import type { NoteEditorSlot } from "../editor/NoteEditor";
import { allowEditing, type OpenedNote } from "../editor/note-io";
import type { Draft } from "../editor/save-draft";
import type { DraftAutosaveOwner, SavedInfo } from "../editor/useAutosave";
import { type Host, HostError } from "../host/host";
import { READ_ONLY_VAULT_MESSAGE } from "../host/read-only-host";

export type DocumentTarget = { path: string } | { noteId: string };
type CanvasHistory = Readonly<Record<"undo" | "redo", readonly string[]>>;
const emptyHistory: CanvasHistory = { undo: [], redo: [] };
type CanvasWrite = { text: string; action: string; history: CanvasHistory };

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
	readonly canvasHistory?: CanvasHistory;
	readonly canvasRenameNotice?: string;
}

type Seed = OpenedNote | (() => Promise<OpenedNote>);
type Listener = (document: LiveDocument, reloaded: boolean) => void;
interface Entry {
	path: string;
	document: LiveDocument | null;
	ready: Promise<void>;
	editorReady?: Promise<void>;
	autosave?: Autosave<Draft>;
	editorSlot: NoteEditorSlot;
	transfer?: AbortController;
	canvasTask?: Promise<boolean>;
	canvasPending?: CanvasWrite;
	subscribers: Map<symbol, Listener | undefined>;
}

function isDirty({ document }: Entry) {
	return document !== null && document.saveStatus.kind !== "saved";
}

const canvasTypes = new Set<string>([...BLOCK_TYPES, ...CANVAS_ONLY_TYPES]);

function openedDocument(
	path: string,
	diskText: string | null,
	indexedPaths: ReadonlyMap<string, string>,
	writable: boolean,
): LiveDocument {
	const { note, problems } = parseNote(diskText ?? "");
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
		readOnly: !writable || (diskText !== null && noteId === null),
		base,
		diskText: diskText ?? "",
		draft: note,
		revision: 0,
		saveStatus: { kind: "saved" },
		editorOwner: null,
	};
}

/** One registry per vault generation. Dispose it before the host switches vaults. */
export function createLiveDocuments(
	host: Host,
	{
		notes,
		writable,
		onCanvasTitleSaved,
	}: {
		notes: readonly DocumentRow[];
		writable: boolean;
		onCanvasTitleSaved?: (from: string, to: string, title: string) => void;
	},
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
			...openedDocument(path, baseText, indexedPaths, writable),
			opened,
		};
	}

	function load(path: string, seed?: Seed, passive = false): Entry {
		const opened = typeof seed === "function" ? undefined : seed;
		const entry: Entry = {
			path,
			document: opened ? fromOpened(opened) : null,
			subscribers: new Map(),
			editorSlot: {},
			ready: Promise.resolve(),
		};
		entries.set(path, entry);
		if (!opened)
			entry.ready = run(async () => {
				const path = entry.path;
				if (entries.get(path) !== entry) return;
				const value = await (typeof seed === "function"
					? seed()
					: !passive && editor
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
		if (reloaded) {
			disposeEditor(entry);
			entry.editorSlot = {};
		}
		entry.document = document;
		for (const listener of entry.subscribers.values()) {
			if (entry.document !== document) break;
			listener?.(document, reloaded);
		}
	}

	function disposeEditor(entry: Entry) {
		entry.transfer?.abort();
		entry.editorSlot.editor?.destroy();
	}

	function evictCleanEntry(entry: Entry) {
		if (entry.canvasTask || isDirty(entry)) return;
		const evict = () => {
			const key = entry.path;
			if (
				entry.subscribers.size === 0 &&
				!isDirty(entry) &&
				entries.get(key) === entry
			) {
				entry.autosave?.dispose();
				disposeEditor(entry);
				entries.delete(key);
			}
		};
		// Discard can mark an entry saved before an admitted write finishes.
		// Leave the queue in the registry until that write has settled.
		if (entry.autosave) void entry.autosave.flush().then(evict);
		else evict();
	}

	// The registry orders canvas actions with other workspace writes. The file
	// lock also covers block moves.
	function runCanvas(
		entry: Entry,
		prepare?: (document: LiveDocument) => CanvasWrite | undefined,
	) {
		const result = run(() => {
			const path = entry.path;
			return inOrder(host, path, async () => {
				const document = entry.document;
				if (
					disposed ||
					entries.get(path) !== entry ||
					path !== entry.path ||
					document?.kind !== "canvas" ||
					document.readOnly
				)
					return false;
				const pending = prepare ? prepare(document) : entry.canvasPending;
				if (!pending) return false;
				const { note: draft, problems } = parseNote(pending.text);
				if (
					draft?.header.kind !== "canvas" ||
					draft.header.noteId !== document.noteId ||
					problems.length
				)
					throw new Error("The canvas did not pass the save check.");
				entry.canvasPending = pending;
				const next = { ...document, draft, revision: document.revision + 1 };
				if (
					document.saveStatus.kind === "failed" &&
					document.saveStatus.conflict
				) {
					publish(entry, next);
					return false;
				}
				publish(entry, { ...next, saveStatus: { kind: "saving" } });
				const title = draft.header.title;
				const titleChanged =
					typeof title === "string" && title !== document.base?.header.title;
				let renamed: RenameResult | undefined;
				try {
					if (!document.noteId || indexedPaths.get(document.noteId) !== path)
						throw new CanvasConflict("This canvas changed on disk.");
					await writeCanvasTextLocked(
						host,
						path,
						document.diskText,
						pending.text,
						pending.action,
					);
					if (!disposed && titleChanged)
						renamed = await renameSavedNote(guardMoves(host), path, title);
				} catch (error) {
					const conflict =
						error instanceof CanvasConflict ||
						(error instanceof HostError && error.code === "not-found");
					if (!disposed && entry.document)
						publish(entry, {
							...entry.document,
							saveStatus: {
								kind: "failed",
								reason: error instanceof Error ? error.message : String(error),
								conflict,
							},
							canvasHistory: conflict ? emptyHistory : document.canvasHistory,
						});
					return false;
				}
				entry.canvasPending = undefined;
				if (!disposed && entry.document) {
					const savedPath = renamed?.path ?? path;
					rekey(path, savedPath);
					publish(entry, {
						...entry.document,
						base: draft,
						diskText: pending.text,
						saveStatus: { kind: "saved" },
						// Canvas undo restores saved text and keeps the current filename.
						canvasHistory: titleChanged ? emptyHistory : pending.history,
						canvasRenameNotice: renamed?.notice,
					});
					if (titleChanged) onCanvasTitleSaved?.(path, savedPath, title);
				}
				return true;
			});
		}).finally(() => {
			if (entry.canvasTask === result) {
				entry.canvasTask = undefined;
				if (!entry.subscribers.size) evictCleanEntry(entry);
			}
		});
		entry.canvasTask = result;
		return result;
	}

	/** `ready` supplies the initial snapshot. The listener receives later changes. */
	function subscribe(
		target: DocumentTarget,
		onChange?: Listener,
		seed?: Seed,
		passive = false,
	) {
		const id = "noteId" in target ? target.noteId : null;
		const path =
			"path" in target ? target.path : indexedPaths.get(target.noteId);
		const entry =
			disposed || path === undefined
				? null
				: (entries.get(path) ?? load(path, seed, passive));
		const subscriber = Symbol();
		entry?.subscribers.set(subscriber, undefined);

		function unsubscribe() {
			if (!entry || path === undefined || !entry.subscribers.delete(subscriber))
				return;
			const document = entry.document;
			if (document?.editorOwner === subscriber) {
				entry.editorSlot.editor?.setEditable(false, false);
				publish(entry, { ...document, editorOwner: null });
			}
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
			prepareEditor: () => (entry ? prepareEditor(entry).then(current) : ready),
			current,
			unsubscribe,
			get editorSlot() {
				return entry?.editorSlot;
			},
			ownsEditor: () => current()?.editorOwner === subscriber,
			autosave,
			write,
			editCanvas(
				mutate: Parameters<typeof prepareCanvasEdit>[1],
				action: string,
				mutateHeader?: Parameters<typeof prepareCanvasEdit>[2],
			) {
				if (!entry || !current()) return Promise.resolve(false);
				return runCanvas(entry, (document) => {
					const pending = entry.canvasPending;
					const text = prepareCanvasEdit(
						pending?.text ?? document.diskText,
						mutate,
						mutateHeader,
					);
					const history = document.canvasHistory ?? emptyHistory;
					if (text === document.diskText && !pending) return;
					return {
						text,
						action,
						history:
							text === document.diskText
								? history
								: {
										undo: [...history.undo, document.diskText].slice(-50),
										redo: [],
									},
					};
				});
			},
			stepCanvas(direction: "undo" | "redo") {
				if (!entry || !current()) return Promise.resolve(false);
				return runCanvas(entry, (document) => {
					if (document.saveStatus.kind !== "saved") return;
					const history = document.canvasHistory ?? emptyHistory;
					const text = history[direction].at(-1);
					if (text === undefined) return;
					const other = direction === "undo" ? "redo" : "undo";
					return {
						text,
						action: "undoing or redoing",
						history: {
							...history,
							[direction]: history[direction].slice(0, -1),
							[other]: [...history[other], document.diskText],
						},
					};
				});
			},
			// Adopt bytes read under the block move's file lock.
			acceptCanvasText(from: string, path: string, text: string) {
				const document = entry?.document;
				if (
					!entry ||
					entry.path !== from ||
					document?.kind !== "canvas" ||
					entries.get(entry.path) !== entry ||
					isDirty(entry)
				)
					return;
				if (path === document.path && text === document.diskText) return;
				rekey(document.path, path);
				publish(entry, {
					...openedDocument(path, text, indexedPaths, writable),
					revision: document.revision + 1,
				});
			},
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
			setEditorOwner(owns: boolean, transfer = false) {
				const eligible = () => {
					const document = current();
					if (!document) return null;
					const owner = document.editorOwner;
					const allowed = owns
						? !document.readOnly &&
							(owner === null || owner === subscriber || transfer)
						: owner === subscriber;
					return allowed ? document : null;
				};
				if (!entry || !eligible()) return false;
				const changeOwner = () => {
					const document = eligible();
					if (!document) return false;
					const next = owns ? subscriber : null;
					if (document.editorOwner !== next) {
						entry.editorSlot.editor?.setEditable(false, false);
						publish(entry, { ...document, editorOwner: next });
					}
					return true;
				};
				if (transfer || !owns) entry.transfer?.abort();
				const view = entry.editorSlot.editor?.view;
				if (!view?.composing || (!transfer && owns)) return changeOwner();
				entry.transfer = new AbortController();
				const { signal } = entry.transfer;
				// Let ProseMirror publish the final composition transaction first.
				view.dom.addEventListener(
					"compositionend",
					() => {
						setTimeout(() => {
							if (!signal.aborted) changeOwner();
						});
					},
					{ once: true, signal },
				);
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
					if (text === null && document.opened?.baseText === null) return;
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
									? `This ${latest.kind} was moved or deleted outside the app.`
									: `This ${latest.kind} changed on disk since you opened it.`;
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
		subscribePassive: (target: string | DocumentTarget, onChange: Listener) =>
			subscribe(
				typeof target === "string" ? { noteId: target } : target,
				onChange,
				undefined,
				true,
			),
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
						readOnly:
							!writable ||
							(document.noteId === null && document.opened?.baseText !== null),
					});
			}
		},
		async flushAll() {
			do {
				const results = await Promise.all(
					[...entries.values()].map(async (entry) => {
						while (entry.canvasTask) await entry.canvasTask.catch(() => {});
						if (
							entry.canvasPending &&
							entry.document?.saveStatus.kind === "failed" &&
							!entry.document.saveStatus.conflict
						)
							await runCanvas(entry);
						const saved = await entry.autosave?.flush();
						return saved !== false && !isDirty(entry);
					}),
				);
				if (!results.every(Boolean)) return false;
				// Another entry may have received an edit while a slower one saved.
			} while (
				[...entries.values()].some(
					(entry) => entry.canvasTask || isDirty(entry),
				)
			);
			return true;
		},
		recoveryTexts(now: Date) {
			const texts = new Map<string, string>();
			for (const { document } of entries.values()) {
				if (!document || document.saveStatus.kind === "saved") continue;
				const { path, editorDraft, base, draft, opened, kind } = document;
				const header = (base ?? opened?.note ?? draft)?.header;
				const id = document.noteId ?? header?.noteId ?? path;
				if (texts.has(id)) continue;
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
				disposeEditor(entry);
				entry.subscribers.clear();
			}
			entries.clear();
		},
	};
}

export type LiveDocuments = ReturnType<typeof createLiveDocuments>;
