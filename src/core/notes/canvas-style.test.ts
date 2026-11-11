import { expect, it } from "vitest";
import type { Block } from "../note-format";
import { attrsOf } from "./canvas-ops";
import {
	blockShape,
	blockTextSize,
	hasTextSize,
	setShapeKind,
	setTextSize,
} from "./canvas-style";

const item = (id: string, type: string, attrs = {}): Block => ({
	id,
	type,
	parent: null,
	attrs: { x: 1, y: 2, ...attrs },
});
const blocks = [
	item("h", "shape"),
	item("e", "shape", { shape: "ellipse", tone: "tip" }),
	item("s", "sticky"),
	item("l", "label", { size: "l" }),
	item("c", "paragraph"),
	item("g", "group", { members: [] }),
];

it("changes a shape's outline and leaves the default out of the file", () => {
	const next = setShapeKind(blocks, ["h", "e"], "diamond");
	expect(attrsOf(next[0] as Block)).toEqual({ shape: "diamond", x: 1, y: 2 });
	// Other attributes of the shape are kept.
	expect(attrsOf(next[1] as Block)).toEqual({
		shape: "diamond",
		tone: "tip",
		x: 1,
		y: 2,
	});
	const back = setShapeKind(next, ["h", "e"], "rectangle");
	expect(attrsOf(back[0] as Block)).toEqual({ x: 1, y: 2 });
	expect(blockShape(back[1] as Block)).toBe("rectangle");
	expect(blockShape(next[1] as Block)).toBe("diamond");
});

it("refuses a shape change for anything but shapes, before changing anything", () => {
	expect(() => setShapeKind(blocks, ["h", "s"], "ellipse")).toThrow(
		"Only shapes",
	);
	expect(() => setShapeKind(blocks, ["h", "zzz"], "ellipse")).toThrow(
		"no longer on the canvas",
	);
	expect(() => setShapeKind(blocks, ["h"], "star" as never)).toThrow(
		"not a shape",
	);
});

it("sets the text size of sticky notes, shapes and labels", () => {
	const next = setTextSize(blocks, ["h", "s", "l"], "s");
	expect(blockTextSize(next[0] as Block)).toBe("s");
	expect(blockTextSize(next[2] as Block)).toBe("s");
	expect(blockTextSize(next[3] as Block)).toBe("s");
	const medium = setTextSize(next, ["h", "l"], "m");
	expect(attrsOf(medium[0] as Block)).toEqual({ x: 1, y: 2 });
	expect(attrsOf(medium[3] as Block).size).toBeUndefined();
	// The unrelated items did not change.
	expect(medium[4]).toBe(blocks[4]);
	expect(medium[5]).toBe(blocks[5]);
});

it("refuses a text size for cards and groups, and for a bad size", () => {
	expect(() => setTextSize(blocks, ["h", "c"], "l")).toThrow("text size");
	expect(() => setTextSize(blocks, ["g"], "l")).toThrow("text size");
	expect(() => setTextSize(blocks, ["h"], "xl" as never)).toThrow(
		"not a text size",
	);
});

it("knows which items have a text size", () => {
	expect(blocks.filter(hasTextSize).map((b) => b.id)).toEqual([
		"h",
		"e",
		"s",
		"l",
	]);
	expect(hasTextSize({ id: "x", type: "shape", parent: "p" })).toBe(false);
});
