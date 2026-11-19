import { describe, expect, it } from "vitest";
import type { MatchRow } from "./match";
import { normalizeGroup, normalizeSort } from "./rule";
import { groupRows, sortRows } from "./sort";

const row = (path: string, x?: string | number, tags: string[] = []) => {
	const type = typeof x === "number" ? "number" : "text";
	const fields = x === undefined ? {} : { x: { name: "X", type, value: x } };
	return { path, title: path, tags, fields } as MatchRow;
};
const order = (rows: MatchRow[]) => rows.map((r) => r.path).join(" ");

describe("sort and group", () => {
	it("sorts by a property either way, with empty values last", () => {
		const rows = [row("a", 10), row("b"), row("c", 9), row("d", 10)];
		const by = (dir: "asc" | "desc") => [{ field: "prop:X", dir }] as const;
		expect(order(sortRows(rows, [...by("asc")]))).toBe("c a d b");
		expect(order(sortRows(rows, [...by("desc")]))).toBe("a d c b");
		expect(order(sortRows(rows, [...by("desc")], 2))).toBe("a d");
		const titles = [row("Note 10"), row("note 9"), row("Éa")];
		expect(order(sortRows(titles, [{ field: "title", dir: "asc" }]))).toBe(
			"Éa note 9 Note 10",
		);
	});

	it("groups by tags or values, a note in each of its groups, No value last", () => {
		const rows = [
			row("a", "Done", ["x", "y"]),
			row("b", "done", ["y"]),
			row("c"),
		];
		const groups = (field: string) =>
			groupRows(rows, field).map((g) => `${g.label}: ${order(g.rows)}`);
		expect(groups("prop:X")).toEqual(["Done: a b", "No value: c"]);
		expect(groups("tag")).toEqual(["x: a", "y: a b", "No value: c"]);
	});

	it("normalizes stored sort keys and the group field", () => {
		const keys = [
			{ field: "prop: Due ", dir: "desc" },
			{ field: "bogus" },
			{ field: "prop:Due" },
			{ field: "title" },
			{ field: "type" },
		];
		expect(normalizeSort(keys)).toEqual([
			{ field: "prop:Due", dir: "desc" },
			{ field: "title", dir: "asc" },
		]);
		expect(normalizeSort("x")).toEqual([]);
		expect(["tag", "prop:Status", 3].map(normalizeGroup)).toEqual([
			"tag",
			"prop:Status",
			null,
		]);
	});
});
