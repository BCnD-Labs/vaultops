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

it("keeps columns in notes: a layout or a column cannot be placed on a canvas", () => {
	const lines: Block[] = [
		{ id: "k", type: "columns", parent: null },
		{ id: "c1", type: "column", parent: "k" },
		{ id: "p1", type: "paragraph", parent: "c1" },
		{ id: "c2", type: "column", parent: "k" },
		{ id: "p2", type: "paragraph", parent: "c2" },
	];
	expect(() => placeOnCanvas(doc([], true), lines, 1, 2)).toThrow(
		"Columns stay in notes.",
	);
	expect(() => placeOnCanvas(doc([], true), lines.slice(1, 3), 1, 2)).toThrow(
		"Columns stay in notes.",
	);
	// A block taken out of a column moves like any other.
	const extracted = extractBlock(doc(lines), "p1");
	expect(extracted.lines).toEqual([
		{ id: "p1", type: "paragraph", parent: "c1" },
	]);
	expect(() =>
		placeOnCanvas(doc([], true), extracted.lines, 1, 2),
	).not.toThrow();
});

const layout = (columns: number): Block[] => {
	const lines: Block[] = [{ id: "k", type: "columns", parent: null }];
	for (let i = 1; i <= columns; i++) {
		lines.push({ id: `c${i}`, type: "column", parent: "k" });
		lines.push({ id: `p${i}`, type: "paragraph", parent: `c${i}` });
	}
	return lines;
};

it("drops a column left empty when its only block is taken out", () => {
	const source = doc([line("before"), ...layout(3), line("after")]);
	const result = extractBlock(source, "p1");
	expect(result.doc.blocks.map((l) => l.id)).toEqual([
		"before",
		"k",
		"c2",
		"p2",
		"c3",
		"p3",
		"after",
	]);
	expect(source.blocks).toHaveLength(9);
});

it("keeps a column that still has blocks when one of several is taken out", () => {
	const lines = [...layout(3), line("extra", "c1")];
	const result = extractBlock(doc(lines), "p1");
	expect(result.doc.blocks.map((l) => l.id)).toEqual([
		"k",
		"c1",
		"c2",
		"p2",
		"c3",
		"p3",
		"extra",
	]);
});

it("undoes a layout left with one column, keeping its blocks in place", () => {
	const source = doc([line("before"), ...layout(2), line("after")]);
	const result = extractBlock(source, "p1");
	expect(result.doc.blocks).toEqual([
		line("before"),
		line("p2"),
		line("after"),
	]);
});

it("removes a layout that ends up with nothing in it", () => {
	const lines: Block[] = [
		{ id: "k", type: "columns", parent: null },
		{ id: "c1", type: "column", parent: "k" },
		{ id: "p1", type: "paragraph", parent: "c1" },
	];
	expect(extractBlock(doc(lines), "p1").doc.blocks).toEqual([]);
});

it("leaves an unrelated layout alone", () => {
	const other: Block[] = [
		{ id: "k2", type: "columns", parent: null },
		{ id: "d1", type: "column", parent: "k2" },
		{ id: "q1", type: "paragraph", parent: "d1" },
	];
	const result = extractBlock(doc([...layout(3), ...other, line("z")]), "z");
	expect(result.doc.blocks).toHaveLength(layout(3).length + other.length);
});
