import type { JSONContent } from "@tiptap/core";
import type { Note } from "../core/note-format";
import { renameNote } from "../core/notes/rename";
import type { Host } from "../host/host";
import { type OpenedNote, saveDoc } from "./note-io";

/** Everything the person can edit in an open note. */
export interface Draft {
	doc: JSONContent;
	title: string;
}

export type DraftOutcome =
	| {
			ok: true;
			/** Where the note is now (changes when the title renames the file). */
			path: string;
			note: Note;
			titleChanged: boolean;
			/** Set when the content is saved but the file could not take the new name. */
			notice?: string;
	  }
	| { ok: false; message: string };

/**
 * Save body and title together so one can never overwrite the other: write the
 * note with the new title first, then rename the file to match. A rename that
 * fails keeps the title and the content saved and reports a notice.
 */
export async function saveDraft(
	host: Host,
	current: OpenedNote,
	draft: Draft,
): Promise<DraftOutcome> {
	if (!current.editable || !current.note) {
		return {
			ok: false,
			message: "This note is read-only, so it was not saved.",
		};
	}
	const titleChanged = draft.title !== current.note.header.title;
	const target: OpenedNote = titleChanged
		? {
				...current,
				note: {
					...current.note,
					header: { ...current.note.header, title: draft.title },
				},
			}
		: current;
	const saved = await saveDoc(host, target, draft.doc);
	if (!saved.ok) return saved;
	if (!titleChanged) {
		return { ok: true, path: current.path, note: saved.note, titleChanged };
	}
	const renamed = await renameNote(host, current.path, saved.note, draft.title);
	return {
		ok: true,
		path: renamed.path,
		note: saved.note,
		titleChanged,
		...(renamed.notice ? { notice: renamed.notice } : {}),
	};
}
