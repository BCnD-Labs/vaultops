import { expect, it } from "vitest";
import type { Note } from "../note-format";
import { blockPosition, canvasRoots, moveCanvasCard } from "./canvas-position";

const canvas: Note = {
	header: {
		format: "vaultops-note",
		v: 1,
		noteId: "board",
		kind: "canvas",
		extra: "kept",
	},
	blocks: [
		{
			id: "a",
			type: "paragraph",
			parent: null,
			attrs: { x: 12, y: 30, color: "mint" },
			content: [{ type: "text", text: "Card" }],
		},
		{
			id: "child",
			type: "paragraph",
			parent: "a",
			content: [{ type: "text", text: "Nested" }],
		},
	],
};

it("reads root positions and moves a card while keeping its other attributes and children", () => {
	expect(
		canvasRoots(canvas.blocks).map((block) => [block.id, blockPosition(block)]),
	).toEqual([["a", { x: 12, y: 30 }]]);
	const [moved, child] = moveCanvasCard(canvas.blocks, "a", {
		x: 100,
		y: -20,
	});
	expect(moved?.attrs).toEqual({ x: 100, y: -20, color: "mint" });
	expect(child).toEqual(canvas.blocks[1]);
});

it.each(["missing", "child"])("refuses to move %s as a card", (id) => {
	expect(() => moveCanvasCard(canvas.blocks, id, { x: 1, y: 2 })).toThrow(
		"no longer on the canvas",
	);
});
