import { CANVAS_ONLY_TYPES, type Note, parseNote } from "../core/note-format";
import {
	type DocumentRow,
	indexDocumentIds,
} from "../core/notes/document-identity";
import type { Autosave, AutosaveState } from "../editor/autosave";
import { BLOCK_TYPES } from "../editor/blocks";
import { checkBlocks } from "../editor/doc-blocks";
import {
	allowEditing,
	lockedForReadOnlyVault,
	type OpenedNote,
} from "../editor/note-io";
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
			opened: writable ? opened : lockedForReadOnlyVault(opened),
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
			if (
				!entry.subscribers.size &&
				(!document || document.saveStatus.kind === "saved") &&
				entries.get(document?.path ?? path) === entry
			) {
				entry.autosave?.dispose();
				entries.delete(document?.path ?? path);
			}
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
			if (!entry || !document || !editor) return null;
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
				if (saveStatus.kind === "saved" && !entry.subscribers.size) {
					entries.delete(latest.path);
					auto.dispose();
				}
			});
			const change = auto.change;
			auto.change = (editorDraft) => {
				const latest = entry.document;
				if (disposed || !latest) return;
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
			unlock() {
				const document = current();
				if (!entry || !document?.opened) return null;
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
