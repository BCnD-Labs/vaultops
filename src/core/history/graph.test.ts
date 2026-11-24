import { describe, expect, it } from "vitest";
import { layoutGraph } from "./graph";

const c = (id: string, ...parents: string[]) => ({ id, parents });
const pairs = (segs: { from: number; to: number }[]) =>
	segs.map((s) => [s.from, s.to]);

describe("layoutGraph", () => {
	it("keeps a straight history in one column", () => {
		const rows = layoutGraph([c("c3", "c2"), c("c2", "c1"), c("c1")]);
		expect(rows.map((r) => r.col)).toEqual([0, 0, 0]);
		expect(pairs(rows[0]?.top ?? [])).toEqual([]);
		expect(pairs(rows[0]?.bottom ?? [])).toEqual([[0, 0]]);
		expect(pairs(rows[1]?.top ?? [])).toEqual([[0, 0]]);
		expect(pairs(rows[2]?.bottom ?? [])).toEqual([]);
		expect(rows.every((r) => r.width === 1)).toBe(true);
	});

	it("draws a branch and its merge", () => {
		// m merges b into a; both came from c.
		const rows = layoutGraph([
			c("m", "a", "b"),
			c("b", "c"),
			c("a", "c"),
			c("c"),
		]);
		const [m, b, a, root] = rows;
		expect(m?.col).toBe(0);
		expect(pairs(m?.bottom ?? [])).toEqual([
			[0, 0],
			[0, 1],
		]);
		expect(b?.col).toBe(1);
		expect(pairs(b?.top ?? [])).toEqual([
			[0, 0],
			[1, 1],
		]);
		expect(a?.col).toBe(0);
		// Both lanes now wait for c; the second joins it.
		expect(root?.col).toBe(0);
		expect(pairs(root?.top ?? [])).toEqual([
			[0, 0],
			[1, 0],
		]);
		expect(m?.width).toBe(2);
		expect(b?.color).not.toBe(m?.color);
	});

	it("puts two branch tips side by side", () => {
		const rows = layoutGraph([c("x", "base"), c("y", "base"), c("base")]);
		expect(rows.map((r) => r.col)).toEqual([0, 1, 0]);
		expect(pairs(rows[2]?.top ?? [])).toEqual([
			[0, 0],
			[1, 0],
		]);
	});
});
