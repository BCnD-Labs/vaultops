import { expect, it } from "vitest";
import type { Block } from "../note-format";
import {
	alignRects,
	arrangeItems,
	arrangeRects,
	distributeRects,
	SNAP_DISTANCE,
	snapToObjects,
	withGroupMembers,
} from "./canvas-arrange";
import { canvasNodes, groupMembers } from "./canvas-ops";

const rects = {
	a: { x: 0, y: 10, w: 100, h: 40 },
	b: { x: 150, y: 80, w: 60, h: 20 },
	c: { x: 300, y: 30, w: 80, h: 60 },
};

it("aligns on the left, right and centre lines without touching the other axis", () => {
	expect(alignRects(rects, "left")).toEqual({
		a: { x: 0, y: 10 },
		b: { x: 0, y: 80 },
		c: { x: 0, y: 30 },
	});
	expect(alignRects(rects, "right")).toEqual({
		a: { x: 280, y: 10 },
		b: { x: 320, y: 80 },
		c: { x: 300, y: 30 },
	});
	expect(alignRects(rects, "center")).toEqual({
		a: { x: 140, y: 10 },
		b: { x: 160, y: 80 },
		c: { x: 150, y: 30 },
	});
});

it("aligns on the top, bottom and middle lines", () => {
	expect(alignRects(rects, "top")).toEqual({
		a: { x: 0, y: 10 },
		b: { x: 150, y: 10 },
		c: { x: 300, y: 10 },
	});
	expect(alignRects(rects, "bottom")).toEqual({
		a: { x: 0, y: 60 },
		b: { x: 150, y: 80 },
		c: { x: 300, y: 40 },
	});
	expect(alignRects(rects, "middle")).toEqual({
		a: { x: 0, y: 35 },
		b: { x: 150, y: 45 },
		c: { x: 300, y: 25 },
	});
});

it("does nothing for fewer than two items, and refuses unusable sizes", () => {
	expect(alignRects({ a: rects.a }, "left")).toEqual({});
	expect(() =>
		alignRects({ a: rects.a, b: { x: 0, y: 0, w: Number.NaN, h: 1 } }, "left"),
	).toThrow(/size/);
	expect(() =>
		alignRects({ a: rects.a, b: { x: 0, y: 0, w: -1, h: 1 } }, "left"),
	).toThrow(/size/);
});

it("distributes with equal gaps, keeping the outer edges and the order", () => {
	const out = distributeRects(
		{
			c: { x: 300, y: 0, w: 100, h: 10 },
			a: { x: 0, y: 0, w: 100, h: 10 },
			b: { x: 120, y: 5, w: 50, h: 10 },
		},
		"horizontal",
	);
	// span 0..400, widths 250, two gaps of 75
	expect(out).toEqual({
		a: { x: 0, y: 0 },
		b: { x: 175, y: 5 },
		c: { x: 300, y: 0 },
	});
	const vertical = distributeRects(
		{
			a: { x: 0, y: 0, w: 10, h: 40 },
			b: { x: 3, y: 10, w: 10, h: 20 },
			c: { x: 0, y: 200, w: 10, h: 40 },
		},
		"vertical",
	);
	// span 0..240, heights 100, two gaps of 70
	expect(vertical).toEqual({
		a: { x: 0, y: 0 },
		b: { x: 3, y: 110 },
		c: { x: 0, y: 200 },
	});
});

it("needs three items to distribute", () => {
	expect(distributeRects({ a: rects.a, b: rects.b }, "horizontal")).toEqual({});
	expect(
		arrangeRects({ a: rects.a, b: rects.b }, "distribute-vertical"),
	).toEqual({});
	expect(arrangeRects(rects, "distribute-horizontal")).toEqual(
		distributeRects(rects, "horizontal"),
	);
});

const item = (id: string, x: number, y: number, extra = {}): Block => ({
	id,
	type: "sticky",
	parent: null,
	attrs: { x, y, w: 100, h: 50, ...extra },
});

it("writes one change for the whole arrangement, group members riding along", () => {
	const blocks: Block[] = [
		item("a", 0, 0),
		{ ...item("g", 200, 100, { members: ["m"] }), type: "group" },
		item("m", 210, 120),
		item("z", 500, 0),
	];
	const next = arrangeItems(
		blocks,
		{
			a: { x: 0, y: 0, w: 100, h: 50 },
			g: { x: 200, y: 100, w: 100, h: 50 },
		},
		"left",
	);
	const at = (id: string) => next.find((b) => b.id === id)?.attrs;
	expect(at("g")).toMatchObject({ x: 0, y: 100 });
	expect(at("m")).toMatchObject({ x: 10, y: 120 });
	expect(at("z")).toMatchObject({ x: 500, y: 0 });
	expect(canvasNodes(next)).toHaveLength(4);
	expect(groupMembers(next.find((b) => b.id === "g") as Block)).toEqual(["m"]);
});

it("keeps a member that was arranged itself where the arrangement put it", () => {
	const blocks: Block[] = [
		{ ...item("g", 200, 0, { members: ["m"] }), type: "group" },
		item("m", 210, 20),
	];
	const out = withGroupMembers(blocks, {
		g: { x: 0, y: 0 },
		m: { x: 50, y: 60 },
	});
	expect(out.m).toEqual({ x: 50, y: 60 });
});

it("snaps a box edge or centre to the nearest edge within range, per axis", () => {
	const others = [{ x: 200, y: 100, w: 100, h: 60 }];
	// left edge 3 from 200 → +3 horizontally; top 4 from 100 → +... within range
	expect(snapToObjects({ x: 197, y: 104, w: 50, h: 20 }, others)).toEqual({
		dx: 3,
		dy: -4,
	});
	// centre of the box catches the centre of the other (x: 250)
	expect(snapToObjects({ x: 223, y: 0, w: 50, h: 20 }, others).dx).toBe(2);
	// right edge catches the other's right edge
	expect(snapToObjects({ x: 252, y: 0, w: 50, h: 20 }, others).dx).toBe(-2);
});

it("ignores edges beyond the snap distance, and unusable boxes", () => {
	const others = [{ x: 200, y: 100, w: 100, h: 60 }];
	expect(
		snapToObjects({ x: 200 - SNAP_DISTANCE - 1, y: 0, w: 0, h: 0 }, others),
	).toEqual({ dx: 0, dy: 0 });
	expect(snapToObjects({ x: 194, y: 0, w: 0, h: 0 }, others).dx).toBe(6);
	expect(snapToObjects({ x: 0, y: 0, w: Number.NaN, h: 1 }, others)).toEqual({
		dx: 0,
		dy: 0,
	});
	expect(
		snapToObjects({ x: 0, y: 0, w: 1, h: 1 }, [
			{ x: Number.NaN, y: 0, w: 1, h: 1 },
		]),
	).toEqual({ dx: 0, dy: 0 });
	expect(snapToObjects({ x: 0, y: 0, w: 10, h: 10 }, [])).toEqual({
		dx: 0,
		dy: 0,
	});
});
