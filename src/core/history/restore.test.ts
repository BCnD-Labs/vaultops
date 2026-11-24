import { describe, expect, it } from "vitest";
import type { Block, Note } from "../note-format";
import { prepareSave } from "../note-format";
import { blockText } from "./diff";
import { copyBlockBack, restoreVersion } from "./restore";

const p = (id: string, text: string, parent: string | null = null): Block => ({
	id,
	type: "paragraph",
	parent,
	content: [{ type: "text", text }],
});
const note = (blocks: Block[], noteId = "n", title = "T"): Note =>
	({
		header: { format: "vaultops-note", v: 1, noteId, title },
		blocks,
	}) as Note;

describe("restoreVersion", () => {
	it("takes the old content and title but keeps the current note id", () => {
		const old = note([p("a", "Old")], "n", "Old title");
		const restored = restoreVersion(
			old,
			note([p("b", "New")], "n2", "New title"),
		);
		expect(restored.header).toMatchObject({ noteId: "n2", title: "Old title" });
		expect(restored.blocks.map(blockText)).toEqual(["Old"]);
	});
});

describe("copyBlockBack", () => {
	it("puts a deleted block back after its old neighbour, with its children", () => {
		const old = note([
			p("a", "One"),
			p("t", "Toggle"),
			p("c", "Child", "t"),
			p("b", "Two"),
		]);
		const now = note([p("a", "One"), p("b", "Two")]);
		const back = copyBlockBack(now, old, "t");
		expect(back.blocks.map(blockText)).toEqual([
			"One",
			"Toggle",
			"Child",
			"Two",
		]);
		expect(back.blocks[2]?.parent).toBe("t");
		expect(prepareSave(back).ok).toBe(true);
	});

	it("gives new ids when the block still exists, so an old paragraph sits beside its new text", () => {
		let n = 0;
		const old = note([p("a", "Old words")]);
		const now = note([p("a", "New words")]);
		const back = copyBlockBack(now, old, "a", () => `copy${++n}`);
		expect(back.blocks.map((b) => [b.id, blockText(b)])).toEqual([
			["a", "New words"],
			["copy1", "Old words"],
		]);
		expect(prepareSave(back).ok).toBe(true);
	});

	it("moves a block whose parent is gone to the top level, at the end", () => {
		const old = note([p("t", "Toggle"), p("c", "Child", "t")]);
		const back = copyBlockBack(note([p("x", "Else")]), old, "c");
		expect(back.blocks).toEqual([p("x", "Else"), p("c", "Child", null)]);
		expect(copyBlockBack(note([]), old, "missing").blocks).toEqual([]);
	});
});
