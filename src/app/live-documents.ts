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
import { buildRecoveryText } from "../core/session/recovery";
import type { Autosave, AutosaveState } from "../editor/autosave";
import { BLOCK_TYPES } from "../editor/blocks";
import { blocksToDoc, checkBlocks } from "../editor/doc-blocks";
import { allowEditing, type OpenedNote } from "../editor/note-io";
import type { Draft } from "../editor/save-draft";
import type { DraftAutosaveOwner, SavedInfo } from "../editor/useAutosave";
import type { Host } from "../host/host";

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

type Listener = (document: LiveDocument) => void;
interface Entry {
	document: LiveDocument | null;
	ready: Promise<void>;
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
		open(path: string): Promise<OpenedNote>;
		onSaved(info: SavedInfo): void;
	},
) {
	const indexedPaths = indexDocumentIds(notes);
	const entries = new Map<string, Entry>();
	let disposed = false;

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

	function load(path: string, opened?: OpenedNote): Entry {
		const entry: Entry = {
			document: opened ? fromOpened(opened) : null,
			subscribers: new Map(),
			ready: opened
				? Promise.resolve()
				: (editor?.open(path) ?? host.readText(path)).then((value) => {
						if (entries.get(path) !== entry) return;
						entry.document =
							typeof value === "string"
								? openedDocument(path, value, indexedPaths, writable)
								: fromOpened(value);
					}),
		};
		entries.set(path, entry);
		return entry;
	}

	function publish(entry: Entry, document: LiveDocument) {
		entry.document = document;
		for (const listener of entry.subscribers.values()) {
			if (entry.document !== document) break;
			listener?.(document);
		}
	}

	function evictCleanEntry(entry: Entry, path: string) {
		if (isDirty(entry)) return;
		const evict = () => {
			const document = entry.document;
			const key = document?.path ?? path;
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
	) {
		const id = "noteId" in target ? target.noteId : null;
		const path =
			"path" in target ? target.path : indexedPaths.get(target.noteId);
		const entry =
			disposed || path === undefined
				? null
				: (entries.get(path) ?? load(path, opened));
		const subscriber = Symbol();
		entry?.subscribers.set(subscriber, undefined);

		function unsubscribe() {
			if (!entry || path === undefined || !entry.subscribers.delete(subscriber))
				return;
			const document = entry.document;
			if (document?.editorOwner === subscriber)
				publish(entry, { ...document, editorOwner: null });
			if (!entry.subscribers.size) evictCleanEntry(entry, path);
		}

		function current() {
			const document = entry?.document;
			return document &&
				entry.subscribers.has(subscriber) &&
				(id === null || document.noteId === id)
				? document
				: null;
		}

		if (entry && current()) entry.subscribers.set(subscriber, onChange);
		const ready = entry
			? entry.ready.then(
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
				entries.set(path, entry);
				if (noteId) indexedPaths.set(noteId, path);
				publish(entry, {
					...latest,
					path,
					noteId,
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
					evictCleanEntry(entry, latest.path);
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

		return {
			ready,
			current,
			unsubscribe,
			autosave,
			canWrite: () => writable,
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
				publish(entry, {
					...fromOpened(next),
					revision: document.revision + 1,
				});
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

	return {
		subscribe,
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
