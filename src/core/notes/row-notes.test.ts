import { describe, expect, it, vi } from "vitest";
import { DATABASE_ROW } from "../../editor/database/commands";
import { TITLE_ID } from "../../editor/database/model";
import { MemoryHost } from "../../host/memory-host";
import { type Block, NOTE_FORMAT, NOTE_FORMAT_VERSION } from "../note-format";
import { createNote, loadNote } from "./repository";
import {
	noteTitleFor,
	ROW_BLOCK,
	ROW_TITLE_CELL,
	rowNoteIds,
	syncRowTitles,
	withRowTitle,
} from "./row-notes";

const database = (...rows: Block[]): Block[] => [
	{ id: "db", type: "database", parent: null },
	...rows,
];
const row = (id: string, title: string, noteId?: string): Block => ({
	id,
	type: ROW_BLOCK,
	parent: "db",
	attrs: { cells: { [ROW_TITLE_CELL]: title }, ...(noteId ? { noteId } : {}) },
});
const titleOf = (block: Block | undefined) =>
	(block?.attrs as { cells?: Record<string, string> } | undefined)?.cells?.[
		ROW_TITLE_CELL
	];

describe("names shared with the editor", () => {
	it("are the same ones the database block uses", () => {
		expect(ROW_BLOCK).toBe(DATABASE_ROW);
		expect(ROW_TITLE_CELL).toBe(TITLE_ID);
	});
});

describe("rowNoteIds", () => {
	it("lists each note a database row was turned into once, and ignores bad values", () => {
		const blocks = database(
			row("r1", "Dune", "n1"),
			row("r2", "Emma", "n1"),
			row("r3", "Persuasion", "n2"),
			row("r4", "Plain"),
			{
				id: "r5",
				type: ROW_BLOCK,
				parent: "db",
				attrs: { noteId: 7 },
			},
			{ id: "p", type: "paragraph", parent: null },
		);
		expect(rowNoteIds(blocks)).toEqual(["n1", "n2"]);
	});
});

describe("withRowTitle", () => {
	it("sets the Name of every row that is the note, and no other", () => {
		const blocks = database(
			row("r1", "Dune", "n1"),
			row("r2", "Emma", "n2"),
			row("r3", "Dune again", "n1"),
		);
		const next = withRowTitle(blocks, "n1", "Dune (1965)");
		expect(next?.map(titleOf)).toEqual([
			undefined,
			"Dune (1965)",
			"Emma",
			"Dune (1965)",
		]);
		// The other attributes and the input are left as they were.
		expect(next?.[1]?.attrs).toEqual({
			cells: { title: "Dune (1965)" },
			noteId: "n1",
		});
		expect(titleOf(blocks[1])).toBe("Dune");
	});

	it("keeps the row's other cells", () => {
		const blocks = database({
			id: "r1",
			type: ROW_BLOCK,
			parent: "db",
			attrs: { cells: { title: "Dune", rating: 5 }, noteId: "n1" },
		});
		const next = withRowTitle(blocks, "n1", "Dune 2");
		expect(next?.[1]?.attrs).toEqual({
			cells: { title: "Dune 2", rating: 5 },
			noteId: "n1",
		});
	});

	it("gives a row with no Name cell the note's title", () => {
		const next = withRowTitle(
			database({
				id: "r1",
				type: ROW_BLOCK,
				parent: "db",
				attrs: { noteId: "n1" },
			}),
			"n1",
			"Dune",
		);
		expect(titleOf(next?.[1])).toBe("Dune");
	});

	it("returns null when the names already agree, so nothing is written", () => {
		const blocks = database(row("r1", "Dune", "n1"));
		expect(withRowTitle(blocks, "n1", "Dune")).toBeNull();
		// Spaces don't count, and a blank Name is the note's "Untitled".
		expect(withRowTitle(blocks, "n1", " Dune ")).toBeNull();
		expect(
			withRowTitle(database(row("r1", "", "n1")), "n1", "Untitled"),
		).toBeNull();
		expect(withRowTitle(blocks, "nope", "Other")).toBeNull();
		expect(withRowTitle([], "n1", "Dune")).toBeNull();
	});

	it("reads a blank title as Untitled", () => {
		expect(noteTitleFor("")).toBe("Untitled");
	});
});

describe("syncRowTitles", () => {
	async function vault() {
		const host = new MemoryHost();
		const dune = await createNote(host, "", "Dune");
		const shelf = await createNote(host, "", "Shelf", {
			blocks: database(
				row("r1", "Dune", dune.note.header.noteId),
				row("r2", "Emma"),
			),
		});
		return { host, dune, shelf };
	}

	it("writes the new name into the database note's rows, atomically", async () => {
		const { host, dune, shelf } = await vault();
		const done = await syncRowTitles(
			host,
			shelf.path,
			dune.note.header.noteId,
			"Dune (1965)",
		);
		expect(done).toEqual({ status: "updated" });
		const after = (await loadNote(host, shelf.path)).note;
		expect(after?.blocks.map(titleOf)).toEqual([
			undefined,
			"Dune (1965)",
			"Emma",
		]);
		// The rest of the note is as it was.
		expect(after?.header.noteId).toBe(shelf.note.header.noteId);
		expect(after?.blocks.map((b) => b.id)).toEqual(["db", "r1", "r2"]);
	});

	it("does not touch the file when the names already agree", async () => {
		const { host, dune, shelf } = await vault();
		const write = vi.spyOn(host, "writeTextAtomic");
		const done = await syncRowTitles(
			host,
			shelf.path,
			dune.note.header.noteId,
			"Dune",
		);
		expect(done).toEqual({ status: "unchanged" });
		expect(write).not.toHaveBeenCalled();
	});

	it("leaves a note it can't read in full alone", async () => {
		const { host, dune } = await vault();
		const damaged = [
			JSON.stringify({
				format: NOTE_FORMAT,
				v: NOTE_FORMAT_VERSION,
				noteId: "damaged",
			}),
			JSON.stringify(row("r1", "Dune", dune.note.header.noteId)),
			"{not json",
		].join("\n");
		await host.writeTextAtomic("Damaged.vnote", damaged);
		const write = vi.spyOn(host, "writeTextAtomic");
		const done = await syncRowTitles(
			host,
			"Damaged.vnote",
			dune.note.header.noteId,
			"New",
		);
		expect(done.status).toBe("skipped");
		expect(write).not.toHaveBeenCalled();
		expect(await host.readText("Damaged.vnote")).toBe(damaged);
	});
});
