import { expect, it } from "vitest";
import type { Block } from "../note-format";
import { parseNote, prepareSave } from "../note-format";
import { reorderItems } from "./canvas-order";

const card = (id: string): Block => ({
	id,
	type: "paragraph",
	parent: null,
	attrs: { x: 0, y: 0 },
});
const ids = (blocks: Block[]) => blocks.map((b) => b.id);
const four = [card("a"), card("b"), card("c"), card("d")];

it("brings an item to the front and sends one to the back", () => {
	expect(ids(reorderItems(four, ["b"], "front"))).toEqual(["a", "c", "d", "b"]);
	expect(ids(reorderItems(four, ["c"], "back"))).toEqual(["c", "a", "b", "d"]);
});

it("keeps several picked items in their own order", () => {
	expect(ids(reorderItems(four, ["a", "c"], "front"))).toEqual([
		"b",
		"d",
		"a",
		"c",
	]);
	expect(ids(reorderItems(four, ["b", "d"], "back"))).toEqual([
		"b",
		"d",
		"a",
		"c",
	]);
});

it("moves one step without boxes", () => {
	expect(ids(reorderItems(four, ["b"], "forward"))).toEqual([
		"a",
		"c",
		"b",
		"d",
	]);
	expect(ids(reorderItems(four, ["c"], "backward"))).toEqual([
		"a",
		"c",
		"b",
		"d",
	]);
});

it("goes past the next item it overlaps, skipping ones it does not touch", () => {
	const boxes = {
		a: { x: 0, y: 0, w: 100, h: 100 },
		b: { x: 500, y: 0, w: 100, h: 100 },
		c: { x: 50, y: 50, w: 100, h: 100 },
		d: { x: 900, y: 900, w: 10, h: 10 },
	};
	// b does not touch a, so a goes past c.
	expect(ids(reorderItems(four, ["a"], "forward", boxes))).toEqual([
		"b",
		"c",
		"a",
		"d",
	]);
	expect(ids(reorderItems(four, ["c"], "backward", boxes))).toEqual([
		"c",
		"a",
		"b",
		"d",
	]);
});

it("returns the same array when the order does not change", () => {
	expect(reorderItems(four, ["d"], "front")).toBe(four);
	expect(reorderItems(four, ["a"], "back")).toBe(four);
	expect(reorderItems(four, ["d"], "forward")).toBe(four);
	expect(reorderItems(four, ["a"], "backward")).toBe(four);
	expect(reorderItems(four, ["a", "b", "c", "d"], "front")).toBe(four);
});

it("moves a card together with its children and leaves other lines in place", () => {
	const blocks: Block[] = [
		card("a"),
		{ id: "a1", type: "paragraph", parent: "a" },
		{ id: "g", type: "group", parent: null, attrs: { members: [] } },
		card("b"),
		{ id: "b1", type: "paragraph", parent: "b" },
		{
			id: "ab",
			type: "connector",
			parent: null,
			attrs: { from: "a", to: "b" },
		},
	];
	const next = reorderItems(blocks, ["a"], "front");
	expect(ids(next)).toEqual(["b", "b1", "g", "a", "a1", "ab"]);
	// The group and the connector kept their lines (index 2 and 5).
	expect(next[2]?.id).toBe("g");
	expect(next[5]?.id).toBe("ab");
	expect(next).toHaveLength(blocks.length);
	expect(new Set(ids(next))).toEqual(new Set(ids(blocks)));
});

it("refuses groups, connectors and missing items before changing anything", () => {
	const blocks: Block[] = [
		card("a"),
		card("b"),
		{ id: "g", type: "group", parent: null, attrs: { members: [] } },
		{
			id: "ab",
			type: "connector",
			parent: null,
			attrs: { from: "a", to: "b" },
		},
	];
	expect(() => reorderItems(blocks, ["g"], "front")).toThrow("stack");
	expect(() => reorderItems(blocks, ["ab"], "back")).toThrow("stack");
	expect(() => reorderItems(blocks, ["a", "zzz"], "front")).toThrow(
		"no longer on the canvas",
	);
	expect(() => reorderItems(blocks, ["a", "g"], "front")).toThrow("stack");
});

it("produces a canvas that still passes the save check", () => {
	const note = {
		header: { format: "vaultops-note", v: 1, noteId: "n", kind: "canvas" },
		blocks: reorderItems(
			[...four, { id: "d1", type: "paragraph", parent: "d" }],
			["d"],
			"back",
		),
	} as const;
	const saved = prepareSave(note as never);
	expect(saved.ok).toBe(true);
	if (saved.ok) {
		const again = parseNote(saved.text);
		expect(again.problems).toEqual([]);
		expect(again.note?.blocks.map((b) => b.id)).toEqual([
			"d",
			"d1",
			"a",
			"b",
			"c",
		]);
	}
});
