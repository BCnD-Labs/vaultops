import type { Editor } from "@tiptap/core";
import { rowNoteId } from "./commands";

/** How long typing in a row's Name must pause before the note is renamed. */
export const NAME_SYNC_DELAY_MS = 800;

const waiting = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * A row's Name was edited: if the row is a note, the note gets the new name
 * once typing pauses (a file is renamed per pause, not per key). The timer is
 * kept per note, so it still fires if the panel or the note is closed first.
 */
export function syncRowName(editor: Editor, rowId: string, name: string) {
	const noteId = rowNoteId(editor, rowId);
	const rename = editor.storage.noteLink?.source?.rowNotes?.rename;
	if (!noteId || !rename) return;
	clearTimeout(waiting.get(noteId));
	waiting.set(
		noteId,
		setTimeout(() => {
			waiting.delete(noteId);
			rename(noteId, name);
		}, NAME_SYNC_DELAY_MS),
	);
}
