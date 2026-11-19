import { describe, expect, it } from "vitest";
import {
	DEFAULT_LIMIT,
	newViewAttrs,
	normalizeColumns,
	readViewSettings,
} from "./view-attrs";

describe("live view attrs", () => {
	it("keeps the title first and drops unreadable or repeated columns", () => {
		expect(
			normalizeColumns(["prop:Author", "type", 3, "prop:author", "x"]),
		).toEqual(["title", "prop:Author", "type"]);
		expect(normalizeColumns("title")).toEqual(["title"]);
	});

	it("reads empty attrs as every note, unsorted, 200 at a time", () => {
		expect(readViewSettings({})).toEqual({
			title: "",
			rule: { match: "all", conditions: [] },
			sort: [],
			columns: ["title"],
			limit: DEFAULT_LIMIT,
			newer: false,
		});
		expect(readViewSettings({ limit: -1 }).limit).toBe(DEFAULT_LIMIT);
		expect(readViewSettings({ v: 2 }).newer).toBe(true);
	});

	it("starts a new view on the host note's own folder", () => {
		const rule = (path: string | null) =>
			readViewSettings(newViewAttrs(path)).rule.conditions;
		expect(rule("Books/Shelf.vnote")).toEqual([
			{ field: "folder", op: "in", value: "Books", sub: false },
		]);
		expect(rule("Inbox.vnote")).toEqual([
			{ field: "folder", op: "in", value: "", sub: false },
		]);
		expect(rule(null)[0]).toMatchObject({ value: "" });
	});
});
