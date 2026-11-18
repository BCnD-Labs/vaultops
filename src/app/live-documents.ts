import { CANVAS_ONLY_TYPES, type Note, parseNote } from "../core/note-format";
import {
	type DocumentRow,
	indexDocumentIds,
} from "../core/notes/document-identity";
import type { AutosaveState } from "../editor/autosave";
import { BLOCK_TYPES } from "../editor/blocks";
import { checkBlocks } from "../editor/doc-blocks";
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
}

type Listener = (document: LiveDocument) => void;
interface Entry {
	document: LiveDocument | null;
	ready: Promise<void>;
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
) {
	const indexedPaths = indexDocumentIds(notes);
	const entries = new Map<string, Entry>();
	let disposed = false;

	function load(path: string): Entry {
		const entry: Entry = {
			document: null,
			subscribers: new Map(),
			ready: host.readText(path).then((text) => {
				if (entries.get(path) !== entry) return;
				entry.document = openedDocument(path, text, indexedPaths, writable);
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
	function subscribe(target: DocumentTarget, onChange?: Listener) {
		const id = "noteId" in target ? target.noteId : null;
		const path =
			"path" in target ? target.path : indexedPaths.get(target.noteId);
		const entry =
			disposed || path === undefined ? null : (entries.get(path) ?? load(path));
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
				entries.get(path) === entry
			)
				entries.delete(path);
		}

		function current() {
			const document = entry?.document;
			return document &&
				entry.subscribers.has(subscriber) &&
				(id === null || document.noteId === id)
				? document
				: null;
		}

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

		return {
			ready,
			unsubscribe,
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
			for (const entry of entries.values()) entry.subscribers.clear();
			entries.clear();
		},
	};
}
