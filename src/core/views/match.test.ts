import { describe, expect, it } from "vitest";
import { compileRule, type MatchContext, type MatchRow } from "./match";
import type { ViewField } from "./row";
import { normalizeRule } from "./rule";

const ctx: MatchContext = { today: "2026-11-18" }; // a Wednesday

const row = (path: string, more: Partial<MatchRow> = {}): MatchRow => ({
	path,
	title: path,
	tags: [],
	fields: {},
	...more,
});
const prop = (path: string, type: ViewField["type"], value: unknown) =>
	row(path, { fields: { x: { name: "X", type, value } as ViewField } });

/** The paths the stored rule matches, joined by spaces. */
function hits(raw: unknown, rows: MatchRow[], c = ctx): string {
	const test = compileRule(normalizeRule(raw), c);
	return rows
		.filter(test)
		.map((r) => r.path)
		.join(" ");
}
const one = (field: string, op: string, value?: unknown, sub?: boolean) => ({
	conditions: [{ field, op, value, sub }],
});

describe("live view rules", () => {
	it("matches tag descendants by default, or the exact tag when asked", () => {
		const rows = [
			row("a", { tags: ["Work/Clients"] }),
			row("b", { tags: ["work"] }),
			row("c", { tags: ["workshop"] }),
		];
		expect(hits(one("tag", "has", "work"), rows)).toBe("a b");
		expect(hits(one("tag", "has", "work", false), rows)).toBe("b");
		expect(hits(one("tag", "not", "work"), rows)).toBe("c");
	});

	it("matches folders with or without subfolders", () => {
		const rows = [row("B/a"), row("B/O/b"), row("By/c"), row("d")];
		expect(hits(one("folder", "in", "B"), rows)).toBe("B/a B/O/b");
		expect(hits(one("folder", "in", "B", false), rows)).toBe("B/a");
		expect(hits(one("folder", "in", "", false), rows)).toBe("d");
	});

	it("tests text, select and list properties", () => {
		const rows = [
			prop("t", "text", "Hello World"),
			prop("s", "select", "Reading"),
			prop("l", "list", ["Ada", "Bo"]),
			prop("e", "text", ""),
			row("none"),
		];
		expect(hits(one("prop:x", "contains", "world"), rows)).toBe("t");
		// A list contains whole items; text contains any part.
		expect(hits(one("prop:X", "contains", "ad"), rows)).toBe("s");
		expect(hits(one("prop:X", "contains", "ada"), rows)).toBe("l");
		expect(hits(one("prop:X", "is", "reading"), rows)).toBe("s");
		expect(hits(one("prop:X", "oneOf", ["Bo", "Reading"]), rows)).toBe("s l");
		expect(hits(one("prop:X", "empty"), rows)).toBe("e none");
		expect(hits(one("prop:X", "notEmpty"), rows)).toBe("t s l");
	});

	it("tests number and checkbox properties", () => {
		const rows = [
			prop("n5", "number", 5),
			prop("n9", "number", 9),
			prop("on", "checkbox", true),
			prop("off", "checkbox", false),
		];
		expect(hits(one("prop:X", "lt", 6), rows)).toBe("n5");
		expect(hits(one("prop:X", "gt", 6), rows)).toBe("n9");
		expect(hits(one("prop:X", "is", 9), rows)).toBe("n9");
		expect(hits(one("prop:X", "checked"), rows)).toBe("on");
		expect(hits(one("prop:X", "checked", false), rows)).toBe("n5 n9 off");
	});

	it("tests date properties against today", () => {
		const rows = ["11-15", "11-18", "11-21", "11-22", "12-01"].map((d) =>
			prop(d, "date", `2026-${d}`),
		);
		expect(hits(one("prop:X", "before", "2026-11-18"), rows)).toBe("11-15");
		expect(hits(one("prop:X", "after", "2026-11-22"), rows)).toBe("12-01");
		expect(hits(one("prop:X", "today"), rows)).toBe("11-18");
		expect(hits(one("prop:X", "thisWeek"), rows)).toBe("11-15 11-18 11-21");
		const monday = { ...ctx, weekStartsOn: 1 as const };
		expect(hits(one("prop:X", "thisWeek"), rows, monday)).toBe(
			"11-18 11-21 11-22",
		);
		expect(hits(one("prop:X", "nextDays", 3), rows)).toBe("11-18 11-21");
	});

	it("matches type and links, and joins conditions with all or any", () => {
		const rows = [
			row("a", { id: "A", type: "book", links: ["B"] }),
			row("b", { id: "B", type: "film" }),
			row("c", { id: "C" }),
		];
		expect(hits(one("type", "is", ["book", "film"]), rows)).toBe("a b");
		expect(hits(one("linked", "to", "B"), rows)).toBe("a");
		const linksOf = (id: string) => (id === "A" ? ["B", "C"] : []);
		expect(hits(one("linked", "from", "A"), rows, { ...ctx, linksOf })).toBe(
			"b c",
		);
		const both = [one("type", "is", ["book"]), one("linked", "to", "x")];
		const conditions = both.flatMap((r) => r.conditions);
		expect(hits({ match: "all", conditions }, rows)).toBe("");
		expect(hits({ match: "any", conditions }, rows)).toBe("a");
	});

	it("leaves out the host note, canvases and hidden cards unless Type is used", () => {
		const rows = [
			row("host"),
			row("c", { kind: "canvas", type: "t" }),
			row(".vaultops/resources/cards/x", { type: "t" }),
			row(".vaultops/templates/y", { type: "t" }),
			row("n"),
		];
		const c = { ...ctx, hostPath: "host" };
		expect(hits({}, rows, c)).toBe("n");
		expect(hits(one("type", "is", ["t"]), rows, c)).toBe(
			"c .vaultops/resources/cards/x",
		);
	});

	it("normalizes stored rules, dropping conditions it can't read", () => {
		const rule = normalizeRule({
			match: "any",
			conditions: [
				{ field: "tag", op: "has", value: " #Work " },
				{ field: "tag", op: "has", value: "  " },
				{ field: "folder", op: "in", value: "../x" },
				{ field: "type", op: "is", value: [] },
				{ field: "prop:", op: "empty" },
				{ field: "prop: Due ", op: "before", value: "2026-02-30" },
				{ field: "prop:Due", op: "nextDays", value: 0 },
				{ field: "prop:Due", op: "explode" },
				{ field: "prop: Pages", op: "lt", value: 10 },
				"junk",
			],
		});
		expect(rule).toEqual({
			match: "any",
			conditions: [
				{ field: "tag", op: "has", value: "Work", sub: true },
				{ field: "prop:Pages", op: "lt", value: 10 },
			],
		});
		expect(normalizeRule(null)).toEqual({ match: "all", conditions: [] });
	});
});
