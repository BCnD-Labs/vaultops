import type { Block } from "../note-format";
import { groupMembers, numberAttr, setPositions } from "./canvas-ops";

/** An item's box in canvas coordinates. */
export interface Rect {
	x: number;
	y: number;
	w: number;
	h: number;
}

export type Align = "left" | "center" | "right" | "top" | "middle" | "bottom";
export type Distribute = "horizontal" | "vertical";
export type Arrange = Align | `distribute-${Distribute}`;

type Positions = { [id: string]: { x: number; y: number } };

function sound(rect: Rect): boolean {
	return (
		Number.isFinite(rect.x) &&
		Number.isFinite(rect.y) &&
		Number.isFinite(rect.w) &&
		Number.isFinite(rect.h) &&
		rect.w >= 0 &&
		rect.h >= 0
	);
}

function checked(rects: { [id: string]: Rect }): [string, Rect][] {
	const entries = Object.entries(rects);
	for (const [, rect] of entries)
		if (!sound(rect)) throw new Error("An item has no usable size.");
	return entries;
}

/** Line the items up on one edge or centre line. Only the moved axis changes. */
export function alignRects(
	rects: { [id: string]: Rect },
	mode: Align,
): Positions {
	const entries = checked(rects);
	if (entries.length < 2) return {};
	const horizontal = mode === "left" || mode === "center" || mode === "right";
	const lows = entries.map(([, r]) => (horizontal ? r.x : r.y));
	const highs = entries.map(([, r]) => (horizontal ? r.x + r.w : r.y + r.h));
	const low = Math.min(...lows);
	const high = Math.max(...highs);
	const out: Positions = {};
	for (const [id, r] of entries) {
		const size = horizontal ? r.w : r.h;
		const start =
			mode === "left" || mode === "top"
				? low
				: mode === "right" || mode === "bottom"
					? high - size
					: (low + high) / 2 - size / 2;
		out[id] = horizontal
			? { x: Math.round(start), y: r.y }
			: { x: r.x, y: Math.round(start) };
	}
	return out;
}

/**
 * Space three or more items so the gaps between them are equal. The outermost
 * edges stay where they are; the items keep their order along the axis.
 */
export function distributeRects(
	rects: { [id: string]: Rect },
	axis: Distribute,
): Positions {
	const entries = checked(rects);
	if (entries.length < 3) return {};
	const horizontal = axis === "horizontal";
	const start = (r: Rect) => (horizontal ? r.x : r.y);
	const size = (r: Rect) => (horizontal ? r.w : r.h);
	const sorted = [...entries].sort(
		(a, b) => start(a[1]) - start(b[1]) || a[0].localeCompare(b[0]),
	);
	const first = start((sorted[0] as [string, Rect])[1]);
	const last = Math.max(...sorted.map(([, r]) => start(r) + size(r)));
	const used = sorted.reduce((sum, [, r]) => sum + size(r), 0);
	const gap = (last - first - used) / (sorted.length - 1);
	const out: Positions = {};
	let cursor = first;
	for (const [id, r] of sorted) {
		out[id] = horizontal
			? { x: Math.round(cursor), y: r.y }
			: { x: r.x, y: Math.round(cursor) };
		cursor += size(r) + gap;
	}
	return out;
}

export function arrangeRects(
	rects: { [id: string]: Rect },
	how: Arrange,
): Positions {
	if (how === "distribute-horizontal")
		return distributeRects(rects, "horizontal");
	if (how === "distribute-vertical") return distributeRects(rects, "vertical");
	return alignRects(rects, how);
}

/**
 * The same move for everything a moved group carries. A group's members follow
 * it unless they were arranged themselves.
 */
export function withGroupMembers(
	blocks: Block[],
	positions: Positions,
): Positions {
	const out: Positions = { ...positions };
	for (const [id, to] of Object.entries(positions)) {
		const group = blocks.find((b) => b.id === id && b.type === "group");
		if (!group) continue;
		const dx = to.x - numberAttr(group, "x", to.x);
		const dy = to.y - numberAttr(group, "y", to.y);
		if (dx === 0 && dy === 0) continue;
		for (const member of groupMembers(group)) {
			if (member in positions) continue;
			const block = blocks.find((b) => b.id === member);
			if (!block) continue;
			out[member] = {
				x: numberAttr(block, "x", 0) + dx,
				y: numberAttr(block, "y", 0) + dy,
			};
		}
	}
	return out;
}

/** Align or distribute the items and write the result: one change, one undo step. */
export function arrangeItems(
	blocks: Block[],
	rects: { [id: string]: Rect },
	how: Arrange,
): Block[] {
	const moves = arrangeRects(rects, how);
	return setPositions(blocks, withGroupMembers(blocks, moves));
}

/** How far a dragged box may be from another item's edge and still catch on it. */
export const SNAP_DISTANCE = 6;

function lines(start: number, size: number): number[] {
	return [start, start + size / 2, start + size];
}

function nearest(mine: number[], theirs: number[], within: number): number {
	let best = 0;
	let bestDistance = within + 1;
	for (const a of mine)
		for (const b of theirs) {
			const distance = Math.abs(b - a);
			if (distance < bestDistance) {
				bestDistance = distance;
				best = b - a;
			}
		}
	return bestDistance <= within ? best : 0;
}

/**
 * The nudge that makes the moving box's edges or centre line up with the
 * nearest edges or centres of the other boxes, per axis, within `within`.
 */
export function snapToObjects(
	moving: Rect,
	others: Rect[],
	within: number = SNAP_DISTANCE,
): { dx: number; dy: number } {
	if (!sound(moving)) return { dx: 0, dy: 0 };
	const near = others.filter(sound);
	return {
		dx: nearest(
			lines(moving.x, moving.w),
			near.flatMap((r) => lines(r.x, r.w)),
			within,
		),
		dy: nearest(
			lines(moving.y, moving.h),
			near.flatMap((r) => lines(r.y, r.h)),
			within,
		),
	};
}
