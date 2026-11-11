import type { Host } from "../../host/host";
import { NOTE_EXT } from "../file-name/file-name";
import type { NoteGuard } from "./rename";
import { createNote, loadNote } from "./repository";

export interface DuplicateResult {
	/** The new file, when one was made. */
	path?: string;
	/** Plain-words message when nothing was made. */
	notice?: string;
}

/**
 * Copy a note or canvas into a new file beside it, titled "<title> (copy)".
 * The copy gets its own `noteId` and a free file name (never overwriting), and
 * its blocks start as new, uncommitted changes like any new note. The original
 * is only read. Read-only or damaged files are refused and nothing is written.
 */
export async function duplicateNote(
	host: Host,
	path: string,
	guard: NoteGuard = {},
): Promise<DuplicateResult> {
	if (guard.readOnly) {
		return { notice: "This note is read-only, so it was not duplicated." };
	}
	const parsed = await loadNote(host, path);
	if (!parsed.note || parsed.skippedLines.length > 0) {
		return {
			notice: "This note could not be read in full, so it was not duplicated.",
		};
	}
	const cut = path.lastIndexOf("/");
	const folder = cut === -1 ? "" : path.slice(0, cut);
	const fileTitle = path.slice(cut + 1, -NOTE_EXT.length);
	const own = parsed.note.header.title;
	const title = `${(typeof own === "string" && own.trim()) || fileTitle} (copy)`;
	const made = await createNote(host, folder, title, {
		header: parsed.note.header,
		blocks: parsed.note.blocks,
	});
	return { path: made.path };
}
