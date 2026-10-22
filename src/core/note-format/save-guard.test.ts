import { describe, expect, it } from "vitest";
import type { Block, Note } from "./note-format.js";
import { describeSaveProblems, prepareSave } from "./save-guard.js";

const header = { format: "vaultops-note" as const, v: 1, noteId: "n1" };

function note(blocks: Block[]): Note {
	return { header, blocks };
}

describe("prepareSave", () => {
	it("returns the serialized text for a valid note", () => {
		const result = prepareSave(
			note([
				{ id: "a", type: "bulletList", parent: null },
				{ id: "b", type: "listItem", parent: "a" },
			]),
		);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.text.split("\n")).toHaveLength(4);
			expect(result.text.endsWith("\n")).toBe(true);
		}
	});

	it("refuses a block without an id and gives no text", () => {
		const result = prepareSave(note([{ type: "paragraph", parent: null }]));
		expect(result.ok).toBe(false);
		expect("text" in result).toBe(false);
		if (!result.ok) {
			expect(result.problems.map((p) => p.kind)).toEqual(["missing-id"]);
			expect(result.problems[0]?.line).toBe(2);
		}
	});

	it("refuses a duplicate id and names the block", () => {
		const result = prepareSave(
			note([
				{ id: "a", type: "paragraph", parent: null },
				{ id: "a", type: "paragraph", parent: null },
			]),
		);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.problems).toHaveLength(1);
			expect(result.problems[0]).toMatchObject({
				kind: "duplicate-id",
				blockId: "a",
				line: 3,
			});
		}
	});

	it("refuses an id on an inline node", () => {
		const result = prepareSave(
			note([
				{
					id: "a",
					type: "paragraph",
					parent: null,
					content: [{ type: "text", text: "x", attrs: { id: "oops" } }],
				},
			]),
		);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.problems.map((p) => p.kind)).toEqual(["inline-id"]);
			expect(result.problems[0]?.blockId).toBe("a");
		}
	});

	it("does not block on an orphan parent (reported elsewhere, not a save blocker)", () => {
		const result = prepareSave(
			note([{ id: "a", type: "paragraph", parent: "missing" }]),
		);
		expect(result.ok).toBe(true);
	});

	it("does not change the note it checks", () => {
		const blocks: Block[] = [{ type: "paragraph", parent: null }];
		const before = JSON.stringify(blocks);
		prepareSave(note(blocks));
		expect(JSON.stringify(blocks)).toBe(before);
	});
});

describe("describeSaveProblems", () => {
	it("names each block and line", () => {
		const result = prepareSave(
			note([
				{ type: "paragraph", parent: null },
				{ id: "a", type: "paragraph", parent: null },
				{ id: "a", type: "paragraph", parent: null },
			]),
		);
		if (result.ok) throw new Error("expected refusal");
		const text = describeSaveProblems(result.problems);
		expect(text).toContain("a block (line 2)");
		expect(text).toContain("block a (line 4)");
	});
});
