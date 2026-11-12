import type { Host } from "../../host/host";
import type { Block, JsonValue } from "../note-format";
import { loadNote, saveNote } from "./repository";

/**
 * A database row can be turned into a note (see `linkRowToNote` in
 * src/editor/database). The row keeps the note's `noteId` and the two keep the
 * same name: this is the file side of that, for when the note is renamed while
 * the database's note is not open. Same names as `DATABASE_ROW`, `TITLE_ID` and
 * the `noteId` attribute in src/editor/database (a test checks they agree).
 */
export const ROW_BLOCK = "databaseRow";
export const ROW_TITLE_CELL = "title";
export const ROW_NOTE_ATTR = "noteId";

const isObject = (
	value: JsonValue | undefined,
): value is { [k: string]: JsonValue } =>
	!!value && typeof value === "object" && !Array.isArray(value);

/** The title a note gets for a row's Name: a blank Name is "Untitled", as in the tree. */
export function noteTitleFor(name: string): string {
	return name.trim() === "" ? "Untitled" : name.trim();
}

/** The notes that database rows in these blocks were turned into, once each. */
export function rowNoteIds(blocks: Block[]): string[] {
	const found = new Set<string>();
	for (const block of blocks) {
		const target = block.type === ROW_BLOCK ? block.attrs : undefined;
		if (!isObject(target)) continue;
		const id = target[ROW_NOTE_ATTR];
		if (typeof id === "string" && id !== "") found.add(id);
	}
	return [...found];
}

/**
 * The blocks with the Name of every row that is the note `noteId` set to
 * `title`, or null when no row needs it. Names that only differ by spaces, or
 * a blank Name against "Untitled", count as the same, so nothing is written
 * (and nothing loops) when the two sides already agree.
 */
export function withRowTitle(
	blocks: Block[],
	noteId: string,
	title: string,
): Block[] | null {
	let changed = false;
	const next = blocks.map((block) => {
		if (block.type !== ROW_BLOCK || !isObject(block.attrs)) return block;
		if (block.attrs[ROW_NOTE_ATTR] !== noteId) return block;
		const cells = isObject(block.attrs.cells) ? block.attrs.cells : {};
		const name = cells[ROW_TITLE_CELL];
		if (
			noteTitleFor(typeof name === "string" ? name : "") === noteTitleFor(title)
		)
			return block;
		changed = true;
		return {
			...block,
			attrs: {
				...block.attrs,
				cells: { ...cells, [ROW_TITLE_CELL]: title },
			},
		};
	});
	return changed ? next : null;
}

export type RowTitleSync =
	| { status: "updated" | "unchanged" }
	| { status: "skipped"; reason: string };

/**
 * Write a note's new title into the rows of the database note at `path` that
 * are that note. The file is read fresh and written atomically; one that can't
 * be read in full is left alone (`skipped`) so nothing in it is ever lost.
 */
export async function syncRowTitles(
	host: Host,
	path: string,
	noteId: string,
	title: string,
): Promise<RowTitleSync> {
	const parsed = await loadNote(host, path);
	if (
		!parsed.note ||
		parsed.problems.length > 0 ||
		parsed.skippedLines.length > 0
	) {
		return { status: "skipped", reason: "it could not be read in full" };
	}
	const blocks = withRowTitle(parsed.note.blocks, noteId, title);
	if (!blocks) return { status: "unchanged" };
	const saved = await saveNote(host, path, { ...parsed.note, blocks });
	return saved.ok
		? { status: "updated" }
		: { status: "skipped", reason: "it did not pass the save check" };
}
