import { expect, it } from "vitest";
import type { Block, Note } from "../note-format";
import { extractBlock, insertBlock, placeOnCanvas } from "./block-move";

const line = (id: string, parent: string | null = null): Block => ({
	id,
	type: "paragraph",
	parent,
});
const doc = (blocks: Block[], canvas = false): Note => ({
	header: {
		format: "vaultops-note",
		v: 1,
		noteId: canvas ? "canvas" : "note",
		...(canvas ? { kind: "canvas" } : {}),
	},
	blocks,
});

it("extracts a flat block without changing its ID or the input", () => {
	const source = doc([line("a"), line("b")]);
	const result = extractBlock(source, "a");
	expect(result.lines).toEqual([line("a")]);
	expect(result.doc.blocks).toEqual([line("b")]);
	expect(source.blocks).toHaveLength(2);
	expect(() => extractBlock(source, "missing")).toThrow("not found");
});

it("carries every line of a toggle, including a nested toggle, and keeps open", () => {
	const source = doc([
		{ id: "t", type: "toggle", parent: null, attrs: { open: true } },
		line("summary", "t"),
		{ id: "list", type: "bulletList", parent: "t" },
		{ id: "item", type: "listItem", parent: "list" },
		line("item-text", "item"),
		{ id: "inner", type: "toggle", parent: "t" },
		line("inner-summary", "inner"),
		line("tail"),
	]);
	const extracted = extractBlock(source, "t");
	expect(extracted.lines.map((l) => l.id)).toEqual([
		"t",
		"summary",
		"list",
		"item",
		"item-text",
		"inner",
		"inner-summary",
	]);
	expect(extracted.doc.blocks.map((l) => l.id)).toEqual(["tail"]);
	const inserted = insertBlock(doc([line("a")]), extracted.lines, "a");
	expect(inserted.blocks.map((l) => l.id)).toEqual([
		"a",
		...extracted.lines.map((l) => l.id),
	]);
	expect(inserted.blocks[1]?.attrs).toEqual({ open: true });
	const canvas = placeOnCanvas(doc([], true), extracted.lines, 10, 20);
	expect(canvas.blocks).toHaveLength(7);
	expect(canvas.blocks[0]?.attrs).toEqual({ open: true, x: 10, y: 20 });
});

it("moves a list with descendants after the anchor subtree", () => {
	const source = doc([
		{ id: "list", type: "bulletList", parent: null },
		{ id: "item", type: "listItem", parent: "list" },
		line("child", "item"),
		line("tail"),
	]);
	const extracted = extractBlock(source, "list");
	expect(extracted.lines.map((line) => line.id)).toEqual([
		"list",
		"item",
		"child",
	]);
	expect(extracted.doc.blocks.map((line) => line.id)).toEqual(["tail"]);
	const target = doc([
		line("anchor"),
		line("anchor-child", "anchor"),
		line("next"),
	]);
	const inserted = insertBlock(target, extracted.lines, "anchor");
	expect(inserted.blocks.map((line) => line.id)).toEqual([
		"anchor",
		"anchor-child",
		"list",
		"item",
		"child",
		"next",
	]);
	expect(inserted.blocks[0]?.parent).toBeNull();
	expect(inserted.blocks[2]?.parent).toBeNull();
	expect(inserted.blocks[3]?.parent).toBe("list");
	expect(() => insertBlock(target, [line("anchor")], null)).toThrow(
		"already contains",
	);
	expect(() => insertBlock(target, extracted.lines, "missing")).toThrow(
		"not found",
	);
});

it("places blocks on a canvas and strips canvas coordinates on return to a note", () => {
	const source = doc([{ ...line("a"), attrs: { color: "blue" } }]);
	const placed = placeOnCanvas(
		doc([], true),
		[source.blocks[0] as Block],
		12,
		34,
	);
	expect(placed.blocks[0]).toMatchObject({
		id: "a",
		parent: null,
		attrs: { color: "blue", x: 12, y: 34 },
	});
	expect(insertBlock(doc([]), placed.blocks, null).blocks[0]).toMatchObject({
		id: "a",
		attrs: { color: "blue" },
	});
	expect(source.blocks[0]?.attrs).toEqual({ color: "blue" });
	expect(() =>
		placeOnCanvas(doc([], true), [line("a")], Number.NaN, 0),
	).toThrow("finite");
});

it("drops at the top, and falls back to the nearest saved block above an unsaved one", () => {
	const dest = doc([line("a"), line("b")]);
	const moved = [line("m")];
	const ids = (note: Note) => note.blocks.map((b) => b.id);
	expect(ids(insertBlock(dest, moved, null, { start: true }))).toEqual([
		"m",
		"a",
		"b",
	]);
	expect(
		ids(insertBlock(dest, moved, "unsaved", { near: ["a", "x"] })),
	).toEqual(["a", "m", "b"]);
	expect(ids(insertBlock(dest, moved, "unsaved", { near: ["also"] }))).toEqual([
		"m",
		"a",
		"b",
	]);
	expect(ids(insertBlock(dest, moved, null, {}))).toEqual(["a", "b", "m"]);
	expect(() => insertBlock(dest, moved, "unsaved")).toThrow("not found");
});
