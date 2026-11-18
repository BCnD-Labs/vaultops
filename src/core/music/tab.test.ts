import { describe, expect, it } from "vitest";
import {
	columnX,
	layoutTab,
	parseTab,
	staffHead,
	TAB,
	type TabRow,
	type TabSystem,
} from "./tab";

const RIFF = [
	"Am        G",
	"e|-------0---|-----------|",
	"B|-----1-----|---3---1---|",
	"G|---2-------|-----------|",
	"D|-2---------|-----------|",
	"A|-0---------|-----------|",
	"E|-----------|-3---------|",
].join("\n");

/** The first system of some tab, which every test here expects to exist. */
function first(text: string): TabSystem {
	const [system] = parseTab(text).systems;
	if (!system) throw new Error("no system");
	return system;
}

/** One row of a layout, which the test expects to exist. */
function rowAt(rows: TabRow[], index: number): TabRow {
	const row = rows[index];
	if (!row) throw new Error(`no row ${index}`);
	return row;
}

const staff = (lines: string[], count = 6) =>
	[...lines, ...Array(count - lines.length).fill("|-----------|")].join("\n");

describe("reading tab", () => {
	it("finds string lines, their names and where columns start", () => {
		expect(staffHead("e|---0---|")).toEqual({ name: "e", start: 2 });
		expect(staffHead("D# |--5--|")?.name).toBe("D#");
		expect(staffHead("--0--2--3--")).toEqual({ name: "", start: 0 });
		expect(staffHead("Am        G")).toBeNull();
		expect(staffHead("Verse ---------")).toBeNull();
		expect(staffHead("Bridge ---------")).toBeNull();
	});

	it("reads frets at their columns, bars and the chord line above", () => {
		const system = first(RIFF);
		expect(system.strings).toEqual(["e", "B", "G", "D", "A", "E"]);
		expect(system.width).toBe(24);
		expect(system.bars).toEqual([11, 23]);
		expect(system.notes.filter((n) => n.string === 1)).toEqual([
			{ string: 1, col: 5, text: "1" },
			{ string: 1, col: 15, text: "3" },
			{ string: 1, col: 19, text: "1" },
		]);
		expect(system.labels).toEqual([
			{ col: 0, text: "Am" },
			{ col: 8, text: "G" },
		]);
	});

	it("names unnamed strings: bass, guitar and 7-string", () => {
		const names = (count: number) => first(staff([], count)).strings;
		expect(names(4)).toEqual(["G", "D", "A", "E"]);
		expect(names(6)).toEqual(["e", "B", "G", "D", "A", "E"]);
		expect(names(7)).toEqual(["e", "B", "G", "D", "A", "E", "B"]);
	});

	it("reads muted notes, harmonics and ghost notes as drawn text", () => {
		const { notes } = first(staff(["|-x-<12>-(3)-12-|"]));
		expect(notes.map((n) => [n.col, n.text])).toEqual([
			[1, "x"],
			[3, "<12>"],
			[8, "(3)"],
			[12, "12"],
		]);
	});

	it("makes one system per staff and keeps every other line as unread", () => {
		const sheet = parseTab(
			[
				"Verse 1",
				"",
				RIFF,
				"",
				"|--3--|",
				"|--3--|",
				"",
				staff(["|--5--|"], 4),
				"(repeat x2)",
			].join("\n"),
		);
		expect(sheet.systems.map((s) => s.strings.length)).toEqual([6, 4]);
		expect(sheet.unread).toEqual([
			"Verse 1",
			"|--3--|",
			"|--3--|",
			"(repeat x2)",
		]);
		expect(parseTab("").systems).toEqual([]);
	});
});

describe("laying out tab", () => {
	it("maps columns to x in proportion to the text", () => {
		const { rows } = layoutTab(parseTab(RIFF), 1000);
		expect(rows).toHaveLength(1);
		const row = rowAt(rows, 0);
		expect(columnX(row, 0)).toBe(TAB.left + TAB.col / 2);
		expect(columnX(row, 10) - columnX(row, 5)).toBe(5 * TAB.col);
	});

	it("wraps a long system into rows after a bar line that fits", () => {
		const width = TAB.left + 8 + 16 * TAB.col;
		const { rows, height } = layoutTab(parseTab(RIFF), width);
		expect(rows.map((r) => [r.start, r.end])).toEqual([
			[0, 12],
			[12, 24],
		]);
		const [one, two] = [rowAt(rows, 0), rowAt(rows, 1)];
		expect(two.y).toBe(one.height + TAB.gap);
		expect(height).toBe(one.height * 2 + TAB.gap);
		expect(columnX(two, 12)).toBe(columnX(one, 0));
	});

	it("never splits a two-digit fret when no bar line fits", () => {
		const text = [
			`${"-".repeat(9)}12${"-".repeat(10)}`,
			...Array(5).fill("-".repeat(21)),
		].join("\n");
		const width = TAB.left + 8 + 10 * TAB.col;
		const { rows } = layoutTab(parseTab(text), width);
		expect(rows.map((r) => [r.start, r.end])).toEqual([
			[0, 9],
			[9, 19],
			[19, 21],
		]);
	});
});
