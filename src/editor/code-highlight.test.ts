import { describe, expect, it } from "vitest";
import {
	addRange,
	clipLines,
	formatLines,
	isHighlighted,
	normalizeHighlight,
	parseLines,
	toggleLine,
} from "./code-highlight";

describe("parseLines", () => {
	it("reads lines and ranges, in any order, merged", () => {
		expect(parseLines("2,5-7")).toEqual([
			[2, 2],
			[5, 7],
		]);
		expect(parseLines(" 7 , 2-3,3-4 ")).toEqual([
			[2, 4],
			[7, 7],
		]);
		expect(parseLines("1-2,3")).toEqual([[1, 3]]);
	});

	it("takes a value that does not parse as no highlight", () => {
		for (const bad of [
			"",
			" ",
			"abc",
			"0",
			"3-1",
			"1,,2",
			"1,x",
			"-2",
			"1-",
			"2.5",
			"1-9999999999",
			5,
			null,
			undefined,
			{},
		]) {
			expect(parseLines(bad)).toEqual([]);
		}
	});

	it("does not build a line for every number in a huge range", () => {
		expect(parseLines("1-999999999")).toEqual([[1, 999999999]]);
		expect(isHighlighted(parseLines("1-999999999"), 500000)).toBe(true);
	});
});

describe("formatLines", () => {
	it("writes ascending, merged ranges, or null when none", () => {
		expect(
			formatLines([
				[5, 7],
				[2, 2],
				[3, 3],
			]),
		).toBe("2-3,5-7");
		expect(formatLines([[4, 4]])).toBe("4");
		expect(formatLines([])).toBeNull();
	});
});

describe("toggleLine and addRange", () => {
	it("turns a line on, and off, splitting a range", () => {
		const on = toggleLine([], 3);
		expect(formatLines(on)).toBe("3");
		expect(formatLines(toggleLine(on, 4))).toBe("3-4");
		expect(formatLines(toggleLine(parseLines("2-6"), 4))).toBe("2-3,5-6");
		expect(formatLines(toggleLine(parseLines("2-6"), 2))).toBe("3-6");
		expect(formatLines(toggleLine(parseLines("2-6"), 6))).toBe("2-5");
		expect(formatLines(toggleLine(on, 3))).toBeNull();
	});

	it("adds every line between two, whichever is first", () => {
		expect(formatLines(addRange(parseLines("2"), 2, 5))).toBe("2-5");
		expect(formatLines(addRange(parseLines("9"), 6, 4))).toBe("4-6,9");
	});
});

describe("clipLines and normalizeHighlight", () => {
	it("keeps only the lines the code still has", () => {
		expect(clipLines(parseLines("1,4-9"), 5)).toEqual([
			[1, 1],
			[4, 5],
		]);
		expect(normalizeHighlight("2,5-7", 3)).toBe("2");
		expect(normalizeHighlight("5-7", 3)).toBeNull();
		expect(normalizeHighlight("7,5,6", 9)).toBe("5-7");
		expect(normalizeHighlight("junk", 9)).toBeNull();
	});
});
