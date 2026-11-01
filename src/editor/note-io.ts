import type { JSONContent } from "@tiptap/core";
import {
	describeSaveProblems,
	type Note,
	type ParseResult,
	parseNote,
} from "../core/note-format";
import { saveNote } from "../core/notes/repository";
import { scanVault } from "../core/notes/scan";
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
	canAllowEditing?: boolean;
	notice?: string;
	/**
	 * The file's exact text when it was read or last written by this app. Before
	 * each save the file is compared with it, so a change made elsewhere is never
	 * overwritten.
	 */
	baseText: string | null;
}

export type SaveOutcome =
	| { ok: true; note: Note; text: string }
	| { ok: false; message: string; conflict?: boolean };

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
	const baseText = await host.readText(path);
	const parsed = parseNote(baseText);
	if (!parsed.note) {
		return {
			path,
			note: null,
			doc: EMPTY,
			editable: false,
			baseText,
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
			baseText,
			notice: `This note has ${understood.reason}, which this version can't show or edit. Nothing was changed.`,
		};
	}
	const doc = ensureUniqueIds(blocksToDoc(note.blocks));
	const duplicate = (await scanVault(host)).report.find((e) => e.path === path)
		?.duplicateOf.length;
	const readOnly = duplicate
		? "This note has the same note id as another file, so it is read-only."
		: whyReadOnly(parsed);
	return {
		path,
		note,
		doc,
		editable: readOnly === null,
		canAllowEditing:
			!duplicate &&
			parsed.skippedLines.length > 0 &&
			parsed.problems.every(
				(p) =>
					(p.kind === "invalid-json" || p.kind === "bad-block") &&
					parsed.skippedLines.includes(p.line),
			),
		baseText,
		...(readOnly === null ? {} : { notice: readOnly }),
	};
}

/** Explicit consent applies only to this opening of a safely readable truncated note. */
export function allowEditing(opened: OpenedNote): OpenedNote {
	return opened.canAllowEditing
		? { ...opened, editable: true, canAllowEditing: false, notice: undefined }
		: opened;
}

/**
 * The note as it must be shown in a vault the app may not change: not editable,
 * so nothing is saved, renamed or moved. Its own notice, if any, is kept.
 */
export function lockedForReadOnlyVault(opened: OpenedNote): OpenedNote {
	return {
		...opened,
		canAllowEditing: false,
		editable: false,
		notice:
			opened.notice ?? "This vault is read-only, so this note can't be edited.",
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
		return { ok: true, note, text: check.text };
	} catch (error) {
		return {
			ok: false,
			message: error instanceof Error ? error.message : String(error),
		};
	}
}
