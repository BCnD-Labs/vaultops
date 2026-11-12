import type { JSONContent } from "@tiptap/core";
import type { Block } from "../core/note-format";
import { createNote } from "../core/notes/repository";
import { docToBlocks } from "../editor/doc-blocks";
import type { Host } from "../host/host";

/**
 * A row's page as the blocks of a new note. Every block gets a new id, so the
 * row's blocks and the note's never share one while the database note still
 * holds the old copy (a block id lives in one place).
 */
export function rowPageBlocks(content: JSONContent[]): Block[] {
	const blocks = docToBlocks({ type: "doc", content });
	const fresh = new Map<string, string>();
	for (const block of blocks) {
		if (block.id) fresh.set(block.id, crypto.randomUUID());
	}
	return blocks.map((block) => ({
		...block,
		id: block.id ? fresh.get(block.id) : crypto.randomUUID(),
		parent: block.parent === null ? null : (fresh.get(block.parent) ?? null),
	}));
}

export type RowNoteResult =
	| { ok: true; target: string }
	| { ok: false; message: string };

/**
 * Make a note from a database row: in `folder`, titled `title`, holding the
 * row's page `content` (none gives the usual empty note). The row itself is
 * not touched here; the caller only changes it once this has resolved ok, so
 * a failure here leaves the row and its page exactly as they were.
 */
export async function createRowNote(
	host: Host,
	folder: string,
	title: string,
	content: JSONContent[],
): Promise<RowNoteResult> {
	try {
		const blocks = rowPageBlocks(content);
		const made = await createNote(
			host,
			folder,
			title,
			blocks.length > 0 ? { blocks } : undefined,
		);
		return { ok: true, target: made.note.header.noteId };
	} catch (error) {
		const why = error instanceof Error ? error.message : String(error);
		return { ok: false, message: `The note was not made: ${why}` };
	}
}
