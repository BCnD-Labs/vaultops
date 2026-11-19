import { describe, expect, it } from "vitest";
import {
	changeOp,
	fieldKey,
	isMissing,
	knownProps,
	newCondition,
	opsFor,
	propConditionValue,
	viewChoices,
} from "./edit";
import { compileRule, type MatchRow } from "./match";
import type { ViewField } from "./row";
import { normalizeCondition, normalizeRule } from "./rule";

const row = (path: string, more: Partial<MatchRow> = {}): MatchRow => ({
	path,
	title: path,
	tags: [],
	fields: {},
	...more,
});
const field = (name: string, type: ViewField["type"], value: unknown) =>
	({ name, type, value }) as ViewField;

const rows = [
	row("Books/Dune.vnote", {
		id: "n1",
		type: "book",
		tags: ["reading/sci-fi"],
		fields: {
			status: { ...field("Status", "select", "Reading"), options: ["Done"] },
		},
	}),
	row("Books/Old/Emma.vnote", {
		id: "n2",
		fields: { rating: field("Rating", "number", 4) },
	}),
	row(".vaultops/templates/T.vnote", { tags: ["hidden"] }),
];

describe("Edit view choices", () => {
	it("lists folders, tags with parents, types, properties with options and notes", () => {
		const c = viewChoices(rows);
		expect(c.folders).toEqual(["Books", "Books/Old"]);
		expect(c.tags).toEqual(["reading", "reading/sci-fi"]);
		expect(c.types).toEqual(["book"]);
		expect(c.props.map((p) => p.name)).toEqual(["Rating", "Status"]);
		expect(c.props[1]?.options).toEqual(["Done", "Reading"]);
		expect(c.notes.map((n) => n.id)).toEqual(["n1", "n2"]);
	});

	it("offers the operators each property type supports", () => {
		const ops = (t: Parameters<typeof opsFor>[0]) => opsFor(t).map((o) => o.op);
		expect(ops("number")).toContain("gt");
		expect(ops("date")).toContain("nextDays");
		expect(ops("select")).toContain("oneOf");
		expect(ops("checkbox")).toEqual(["checked", "checked"]);
		expect(ops(undefined)).toContain("contains");
	});

	it("starts every new condition complete, and keeps incomplete ones as written", () => {
		const c = viewChoices(rows);
		for (const key of [
			"folder",
			"tag:has",
			"tag:not",
			"type",
			"linked:to",
			"prop:Status",
			"prop:Rating",
		]) {
			const made = newCondition(key, c);
			expect(normalizeCondition(made), key).not.toBeNull();
			expect(fieldKey(made)).toBe(key);
		}
		const text = opsFor("text").find((o) => o.op === "contains");
		const open = changeOp(
			{ field: "prop:Note", op: "empty" },
			text as never,
			[],
			"2026-11-18",
		);
		expect(open).toEqual({ field: "prop:Note", op: "contains" });
		expect(normalizeCondition(open)).toBeNull();
		const dated = opsFor("date").find((o) => o.op === "before");
		expect(changeOp(open, dated as never, [], "2026-11-18")).toMatchObject({
			value: "2026-11-18",
		});
		expect(propConditionValue("options", "a, b,,")).toEqual(["a", "b"]);
		expect(propConditionValue("number", "")).toBeUndefined();
	});

	it("a condition on a property no note has is missing and matches nothing", () => {
		const known = knownProps(viewChoices(rows));
		const rule = normalizeRule({
			conditions: [{ field: "prop:Gone", op: "empty" }],
		});
		const cond = rule.conditions[0] as NonNullable<(typeof rule.conditions)[0]>;
		expect(isMissing(cond, known)).toBe(true);
		expect(isMissing({ field: "prop:status" }, known)).toBe(false);
		const ctx = { today: "2026-11-18" };
		expect(rows.filter(compileRule(rule, ctx)).length).toBeGreaterThan(0);
		expect(
			rows.filter(compileRule(rule, { ...ctx, knownProps: known })),
		).toEqual([]);
	});
});
