import type { JSONContent } from "@tiptap/core";
import {
	describeSaveProblems,
	type Note,
	type ParseResult,
} from "../core/note-format";
import { loadNote, saveNote } from "../core/notes/repository";
import type { Host } from "../host/host";
import { blocksToDoc, checkBlocks, docToBlocks } from "./doc-blocks";
import { ensureUniqueIds } from "./ids";

export interface OpenedNote {
	path: string;
	/** The note as read (null if the file has no usable header). Its header is kept as is on save. */
	note: Note | null;
	/** The document to show. */
	doc: JSONContent;
	/** False for a note this version must not rewrite; `notice` says why. */
	editable: boolean;
	notice?: string;
}

export type SaveOutcome =
	| { ok: true; note: Note }
	| { ok: false; message: string };

const EMPTY: JSONContent = { type: "doc", content: [{ type: "paragraph" }] };

function whyReadOnly(parsed: ParseResult): string | null {
	if (parsed.problems.some((p) => p.kind === "newer-version")) {
		return "This note was written by a newer version of the app, so it's open read-only.";
	}
	if (parsed.skippedLines.length > 0) {
		return "Some lines of this note could not be read, so it's open read-only. Nothing was changed.";
	}
	if (parsed.problems.length > 0) {
		return "This note has block or id problems, so it's open read-only. Nothing was changed.";
	}
	return null;
}

/**
 * Read a note for the editor. A note that is damaged, newer, or has anything
 * this version doesn't fully understand opens read-only (or empty, if it can't
 * be shown at all) and is never written.
 */
export async function openNote(host: Host, path: string): Promise<OpenedNote> {
	const parsed = await loadNote(host, path);
	if (!parsed.note) {
		return {
			path,
			note: null,
			doc: EMPTY,
			editable: false,
			notice: "This file isn't a readable note, so it was left alone.",
		};
	}
	const note = parsed.note;
	const understood = checkBlocks(note.blocks);
	if (!understood.ok) {
		return {
			path,
			note,
			doc: EMPTY,
			editable: false,
			notice: `This note has ${understood.reason}, which this version can't show or edit. Nothing was changed.`,
		};
	}
	const doc = ensureUniqueIds(blocksToDoc(note.blocks));
	const readOnly = whyReadOnly(parsed);
	return {
		path,
		note,
		doc,
		editable: readOnly === null,
		...(readOnly === null ? {} : { notice: readOnly }),
	};
}

/**
 * Save the document into the note: the loaded header is kept unchanged and the
 * blocks come from the document. Goes through the save guard; if it refuses, or
 * the host fails, nothing is written and the message says why.
 */
export async function saveDoc(
	host: Host,
	opened: OpenedNote,
	doc: JSONContent,
): Promise<SaveOutcome> {
	if (!opened.editable || !opened.note) {
		return {
			ok: false,
			message: "This note is read-only, so it was not saved.",
		};
	}
	try {
		const note: Note = {
			header: opened.note.header,
			blocks: docToBlocks(doc),
		};
		const check = await saveNote(host, opened.path, note);
		if (!check.ok) {
			return { ok: false, message: describeSaveProblems(check.problems) };
		}
		return { ok: true, note };
	} catch (error) {
		return {
			ok: false,
			message: error instanceof Error ? error.message : String(error),
		};
	}
}
