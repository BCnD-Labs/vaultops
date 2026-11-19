import { describe, expect, it } from "vitest";
import { type Expr, parseExpression } from "./expression";
import {
	DEFAULT_XMAX,
	DEFAULT_XMIN,
	layoutPlot,
	niceTicks,
	normalizeRange,
	SAMPLES,
	segmentsPath,
} from "./layout";

function expr(source: string): Expr {
	const result = parseExpression(source);
	if (!result.ok) throw new Error(result.message);
	return result.expr;
}

describe("normalizeRange", () => {
	it("keeps a sensible range", () => {
		expect(normalizeRange(-5, 5)).toEqual([-5, 5]);
		expect(normalizeRange(0, 0.5)).toEqual([0, 0.5]);
	});
	it.each([
		[5, 5],
		[5, -5],
		[Number.NaN, 3],
		[0, Number.POSITIVE_INFINITY],
		["1", 2],
		[undefined, undefined],
		[-1e9, 1e9],
	])("falls back to the default for %s..%s", (a, b) => {
		expect(normalizeRange(a, b)).toEqual([DEFAULT_XMIN, DEFAULT_XMAX]);
	});
});

describe("niceTicks", () => {
	it("picks round steps inside the range", () => {
		expect(niceTicks(-10, 10)).toEqual([
			-10, -8, -6, -4, -2, 0, 2, 4, 6, 8, 10,
		]);
		expect(niceTicks(0, 100)).toEqual([0, 20, 40, 60, 80, 100]);
		expect(niceTicks(0, 1)).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1]);
		expect(niceTicks(0.1, 0.4).every((t) => t >= 0.1 && t <= 0.4)).toBe(true);
	});
	it("gives nothing for an empty range", () => {
		expect(niceTicks(3, 3)).toEqual([]);
	});
});

describe("layoutPlot", () => {
	it("draws a parabola as one unbroken line that fits", () => {
		const plot = layoutPlot([expr("x^2")], -10, 10);
		expect(plot.curves).toHaveLength(1);
		expect(plot.curves[0]).toHaveLength(1);
		expect(plot.curves[0]?.[0]).toHaveLength(SAMPLES);
		expect(plot.ymin).toBeLessThanOrEqual(0);
		expect(plot.ymax).toBeGreaterThanOrEqual(100);
	});

	it("breaks tan at its asymptotes and keeps a sensible height", () => {
		const plot = layoutPlot([expr("tan(x)")], -10, 10);
		expect(plot.curves[0]?.length).toBeGreaterThanOrEqual(6);
		expect(plot.ymax - plot.ymin).toBeLessThan(100);
	});

	it("breaks 1/x at zero", () => {
		const plot = layoutPlot([expr("1/x")], -10, 10);
		expect(plot.curves[0]).toHaveLength(2);
	});

	it("leaves out places with no value", () => {
		const plot = layoutPlot([expr("sqrt(x)")], -10, 10);
		expect(plot.curves[0]).toHaveLength(1);
		expect(plot.curves[0]?.[0]?.[0]?.[0]).toBeGreaterThanOrEqual(0);
	});

	it("gives a flat line some height around it", () => {
		const plot = layoutPlot([expr("3")], -10, 10);
		expect(plot.ymin).toBeLessThan(3);
		expect(plot.ymax).toBeGreaterThan(3);
		expect(plot.curves[0]).toHaveLength(1);
	});

	it("uses a default height when nothing can be drawn", () => {
		const plot = layoutPlot([expr("ln(x)")], -10, -1);
		expect(plot.curves[0]).toEqual([]);
		expect(plot.ymin).toBe(-10);
		expect(plot.ymax).toBe(10);
	});

	it("fits several formulas together and honours a given height", () => {
		const both = layoutPlot([expr("x"), expr("100x")], -10, 10);
		expect(both.curves).toHaveLength(2);
		expect(both.ymax).toBeGreaterThanOrEqual(1000);
		const fixed = layoutPlot([expr("x")], -10, 10, [-1, 1]);
		expect([fixed.ymin, fixed.ymax]).toEqual([-1, 1]);
	});

	it("resets a backwards range", () => {
		const plot = layoutPlot([expr("x")], 5, -5);
		expect([plot.xmin, plot.xmax]).toEqual([DEFAULT_XMIN, DEFAULT_XMAX]);
	});
});

describe("segmentsPath", () => {
	it("starts each piece with M", () => {
		const path = segmentsPath(
			[
				[
					[0, 0],
					[1, 1],
				],
				[
					[2, 2],
					[3, 3],
				],
			],
			(v) => v * 10,
			(v) => 100 - v,
		);
		expect(path).toBe("M0.0 100.0 L10.0 99.0 M20.0 98.0 L30.0 97.0");
	});
});
