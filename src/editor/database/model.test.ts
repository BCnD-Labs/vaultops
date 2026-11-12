import { describe, expect, it } from "vitest";
import {
	type Cells,
	cellText,
	convertColumn,
	type DbColumn,
	ensureOption,
	normalizeCells,
	normalizeColumns,
	normalizeNoteId,
	normalizeSort,
	readCell,
	snapProgress,
	sortedOrder,
	TITLE_ID,
} from "./model";

const title: DbColumn = { id: TITLE_ID, name: "Name", type: "title" };

describe("normalizeColumns", () => {
	it("always starts with exactly one title column", () => {
		expect(normalizeColumns(undefined)).toEqual([title]);
		const columns = normalizeColumns([
			{ id: "a", name: "Notes", type: "text" },
			{ id: TITLE_ID, name: "Book", type: "title" },
			{ id: "t2", name: "Second title", type: "title" },
		]);
		expect(columns.map((c) => c.id)).toEqual([TITLE_ID, "a"]);
		expect(columns[0]?.name).toBe("Book");
	});

	it("drops broken entries, repeated ids and unknown types", () => {
		const columns = normalizeColumns([
			null,
			"text",
			{ id: "", type: "text" },
			{ id: "a", type: "formula" },
			{ id: "b", name: 3, type: "number", width: 9999 },
			{ id: "b", name: "Again", type: "text" },
			{
				id: "c",
				name: "Tags",
				type: "multiSelect",
				options: [{ id: "x" }, { id: "y", name: "Y", tone: "neon" }],
			},
		]);
		expect(columns).toEqual([
			title,
			{ id: "b", name: "", type: "number", width: 640 },
			{
				id: "c",
				name: "Tags",
				type: "multiSelect",
				options: [{ id: "y", name: "Y", tone: "gray" }],
			},
		]);
	});
});

it("keeps only readable cell values and a sort on a real column", () => {
	expect(
		normalizeCells({ a: "x", b: 2, c: [1, "y"], d: { no: 1 }, e: Number.NaN }),
	).toEqual({
		a: "x",
		b: 2,
		c: ["y"],
	});
	expect(normalizeSort({ column: TITLE_ID, dir: "up" }, [title])).toEqual({
		column: TITLE_ID,
		dir: "asc",
	});
	expect(normalizeSort({ column: "gone" }, [title])).toBeNull();
});

it("reads a cell only as its column's type", () => {
	const select: DbColumn = {
		id: "s",
		name: "S",
		type: "select",
		options: [{ id: "o1", name: "One", tone: "red" }],
	};
	expect(readCell({ s: "o1" }, select)).toBe("o1");
	expect(readCell({ s: "deleted-option" }, select)).toBeNull();
	expect(readCell({ s: 4 }, { id: "s", name: "", type: "text" })).toBeNull();
	expect(cellText({ s: "o1" }, select)).toBe("One");
});

it("reuses an option with the same name and gives new ones a fresh colour", () => {
	const column: DbColumn = {
		id: "s",
		name: "S",
		type: "select",
		options: [{ id: "o1", name: "Done", tone: "red" }],
	};
	expect(ensureOption(column, " done ").optionId).toBe("o1");
	const made = ensureOption(column, "Doing");
	expect(made.column.options).toHaveLength(2);
	expect(made.column.options?.[1]?.tone).not.toBe("red");
	expect(column.options).toHaveLength(1);
});

describe("convertColumn", () => {
	const text: DbColumn = { id: "c", name: "C", type: "text" };
	const rows: Cells[] = [{ c: "12" }, { c: "a, b" }, {}];

	it("turns text into numbers where it reads as one", () => {
		expect(convertColumn(text, "number", rows).values).toEqual([
			12,
			null,
			null,
		]);
	});

	it("turns text into options, creating them once", () => {
		const { column, values } = convertColumn(text, "multiSelect", rows);
		expect(column.options?.map((o) => o.name)).toEqual(["12", "a", "b"]);
		expect(values[1]).toHaveLength(2);
		expect(values[2]).toEqual([]);
	});

	it("keeps options when moving between select and multi-select", () => {
		const select: DbColumn = {
			id: "c",
			name: "C",
			type: "select",
			options: [{ id: "o", name: "O", tone: "blue" }],
		};
		const { column, values } = convertColumn(select, "multiSelect", [
			{ c: "o" },
			{},
		]);
		expect(column.options).toEqual(select.options);
		expect(values).toEqual([["o"], []]);
		expect(convertColumn(column, "text", [{ c: ["o"] }]).values).toEqual(["O"]);
	});
});

describe("sortedOrder", () => {
	const num: DbColumn = { id: "n", name: "N", type: "number" };
	const rows: Cells[] = [{ n: 3 }, {}, { n: 1 }, { n: 3 }];

	it("keeps file order without a sort", () => {
		expect(sortedOrder(rows, [title, num], null)).toEqual([0, 1, 2, 3]);
	});

	it("sorts, keeps ties in file order and puts empty cells last both ways", () => {
		expect(
			sortedOrder(rows, [title, num], { column: "n", dir: "asc" }),
		).toEqual([2, 0, 3, 1]);
		expect(
			sortedOrder(rows, [title, num], { column: "n", dir: "desc" }),
		).toEqual([0, 3, 2, 1]);
	});

	it("sorts text naturally, ignoring case", () => {
		const names = [
			{ title: "item 10" },
			{ title: "Item 2" },
			{ title: "apple" },
		];
		expect(
			sortedOrder(names, [title], { column: TITLE_ID, dir: "asc" }),
		).toEqual([2, 1, 0]);
	});
});

describe("status and progress", () => {
	const status: DbColumn = {
		id: "s",
		name: "Status",
		type: "status",
		options: [
			{ id: "d", name: "Done", tone: "green", group: "done" },
			{ id: "t", name: "Not started", tone: "gray", group: "todo" },
			{ id: "p", name: "In progress", tone: "blue", group: "doing" },
		],
	};

	it("keeps a group on every status option, defaulting to To do", () => {
		const [, col] = normalizeColumns([
			{
				id: "s",
				name: "S",
				type: "status",
				options: [{ id: "a", name: "A", group: "later" }],
			},
		]);
		expect(col?.options?.[0]?.group).toBe("todo");
		expect(ensureOption(status, "Blocked").column.options?.at(-1)?.group).toBe(
			"todo",
		);
	});

	it("sorts status by group, then by the option's place", () => {
		const rows: Cells[] = [{ s: "d" }, { s: "t" }, {}, { s: "p" }];
		expect(
			sortedOrder(rows, [title, status], { column: "s", dir: "asc" }),
		).toEqual([1, 3, 0, 2]);
	});

	it("only stops progress at 0, 25, 50, 75 and 100", () => {
		expect([0, 10, 13, 49, 62, 80, 100, 140, -5].map(snapProgress)).toEqual([
			0, 0, 25, 50, 50, 75, 100, 100, 0,
		]);
		const progress: DbColumn = { id: "p", name: "P", type: "progress" };
		expect(readCell({ p: 61 }, progress)).toBe(50);
		expect(cellText({ p: 75 }, progress)).toBe("75%");
	});

	it("converts into status and progress", () => {
		const text: DbColumn = { id: "c", name: "C", type: "text" };
		const made = convertColumn(text, "status", [{ c: "Blocked" }, {}]);
		expect(made.column.options?.map((o) => [o.name, o.group])).toContainEqual([
			"Blocked",
			"todo",
		]);
		expect(
			convertColumn(text, "progress", [{ c: "40%" }, { c: "nope" }]).values,
		).toEqual([50, null]);
		const empty = convertColumn(
			{ id: "c", name: "C", type: "number" },
			"status",
			[{}],
		);
		expect(empty.column.options?.map((o) => o.group)).toEqual([
			"todo",
			"doing",
			"done",
		]);
	});
});

describe("normalizeNoteId", () => {
	it("keeps a note id and reads anything else as no note", () => {
		expect(normalizeNoteId("note-dune")).toBe("note-dune");
		for (const bad of [undefined, null, "", 7, true, ["n1"], { id: "n1" }])
			expect(normalizeNoteId(bad)).toBeNull();
	});
});
