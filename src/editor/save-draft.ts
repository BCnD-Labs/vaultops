import type { JSONContent } from "@tiptap/core";
import {
	NOTE_FORMAT,
	NOTE_FORMAT_VERSION,
	type Note,
} from "../core/note-format";
import { type Props, withProps } from "../core/notes/properties";
import { renameNote } from "../core/notes/rename";
import { createNote } from "../core/notes/repository";
import { type Host, HostError } from "../host/host";
import { docToBlocks } from "./doc-blocks";
import { type OpenedNote, saveDoc } from "./note-io";

/** Everything the person can edit in an open note. */
export interface Draft {
	doc: JSONContent;
	title: string;
	/** The note's properties; left out means "leave the header's props as they are". */
	props?: Props;
}

export type DraftOutcome =
	| {
			ok: true;
			/** Where the note is now (changes when the title renames the file). */
			path: string;
			note: Note;
			/** The exact text now on disk. */
			text: string;
			titleChanged: boolean;
			/** Set when the content is saved but the file could not take the new name. */
			notice?: string;
	  }
	| { ok: false; message: string; conflict?: boolean };

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
	// Never overwrite a file that someone else changed: compare it with what
	// this app last read or wrote (exact text, never the modified time).
	if (current.baseText !== null) {
		let onDisk: string | null;
		try {
			onDisk = await host.readText(current.path);
		} catch (error) {
			if (error instanceof HostError && error.code === "not-found") {
				onDisk = null;
			} else {
				return {
					ok: false,
					message: error instanceof Error ? error.message : String(error),
				};
			}
		}
		if (onDisk !== current.baseText) {
			return {
				ok: false,
				conflict: true,
				message:
					onDisk === null
						? "This note was moved or deleted outside the app."
						: "This note changed on disk since you opened it.",
			};
		}
	}
	const titleChanged = draft.title !== current.note.header.title;
	let header = current.note.header;
	if (titleChanged) header = { ...header, title: draft.title };
	if (draft.props !== undefined) header = withProps(header, draft.props);
	const target: OpenedNote =
		header === current.note.header
			? current
			: { ...current, note: { ...current.note, header } };
	const saved = await saveDoc(host, target, draft.doc);
	if (!saved.ok) return saved;
	if (!titleChanged) {
		return {
			ok: true,
			path: current.path,
			note: saved.note,
			text: saved.text,
			titleChanged,
		};
	}
	const renamed = await renameNote(host, current.path, saved.note, draft.title);
	return {
		ok: true,
		path: renamed.path,
		note: saved.note,
		text: saved.text,
		titleChanged,
		...(renamed.notice ? { notice: renamed.notice } : {}),
	};
}

/**
 * Save the draft as a new note beside the original, with its own `noteId` and
 * the title plus " (copy)". The original file is not touched. Returns where
 * the copy is.
 */
export async function saveAsCopy(
	host: Host,
	current: OpenedNote,
	draft: Draft,
): Promise<{ ok: true; path: string } | { ok: false; message: string }> {
	try {
		const cut = current.path.lastIndexOf("/");
		const folder = cut === -1 ? "" : current.path.slice(0, cut);
		const title = `${draft.title || "Untitled"} (copy)`;
		let header: Note["header"] = {
			...(current.note?.header ?? {
				format: NOTE_FORMAT,
				v: NOTE_FORMAT_VERSION,
			}),
			noteId: crypto.randomUUID(),
			title,
		};
		if (draft.props !== undefined) header = withProps(header, draft.props);
		const note: Note = { header, blocks: docToBlocks(draft.doc) };
		const { path } = await createNote(host, folder, title, note);
		return { ok: true, path };
	} catch (error) {
		return {
			ok: false,
			message: error instanceof Error ? error.message : String(error),
		};
	}
}
