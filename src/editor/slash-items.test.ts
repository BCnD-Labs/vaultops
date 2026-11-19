import { describe, expect, it } from "vitest";
import {
	filterSlashItems,
	recentSlashIds,
	SLASH_ITEMS,
	SLASH_SECTIONS,
} from "./slash-items";

describe("slash menu items", () => {
	it("maps every existing command to its section exactly once", () => {
		expect(SLASH_SECTIONS).toEqual([
			"Recent",
			"Write",
			"Organise",
			"Plan",
			"Visual",
			"Media",
		]);
		const ids = (section: string) =>
			SLASH_ITEMS.filter((i) => i.section === section).map((i) => i.id);
		expect(ids("Write")).toEqual([
			"paragraph",
			"heading1",
			"heading2",
			"heading3",
			"heading4",
			"heading5",
			"heading6",
			"code",
			"math",
			"quote",
			"callout-note",
			"callout-info",
			"callout-tip",
			"callout-warning",
			"callout-danger",
		]);
		expect(ids("Organise")).toEqual([
			"bullet",
			"numbered",
			"divider",
			"divider-dashed",
			"divider-dotted",
			"divider-thick",
			"toggle",
			"toggle-heading1",
			"toggle-heading2",
			"switch",
			"columns-2",
			"columns-3",
			"link",
			"mention",
			"frame",
			"template",
		]);
		expect(ids("Plan")).toEqual(["task", "table", "database", "date", "toc"]);
		expect(ids("Visual")).toEqual([
			"mermaid-flowchart",
			"mermaid-sequence",
			"mermaid-mindmap",
			"mermaid-timeline",
			"mermaid-gantt",
			"mermaid-pie",
			"chart",
		]);
		expect(ids("Media")).toEqual(["image", "guitar-tab", "sheet-music"]);
		expect(SLASH_ITEMS).toHaveLength(46);
		expect(SLASH_ITEMS.every((i) => i.icon)).toBe(true);
	});
	it("shows charts in Visual only while the charts feature is on", () => {
		const chart = SLASH_ITEMS.find((item) => item.id === "chart");
		expect(chart).toMatchObject({ section: "Visual", feature: "charts" });
		expect(
			filterSlashItems("chart", {
				columns: true,
				enabled: (id) => id !== "charts",
			}),
		).not.toContain(chart);
	});

	it("remembers five distinct known ids, moving a repeated choice to the front", () => {
		const previous = ["date", "task", "quote", "math", "code"];
		expect(recentSlashIds(["math", null, "gone", ...previous])).toEqual([
			"math",
			"date",
			"task",
			"quote",
			"code",
		]);
		expect(recentSlashIds(["link", ...previous])).toEqual([
			"link",
			"date",
			"task",
			"quote",
			"math",
		]);
		expect(recentSlashIds("date")).toEqual([]);
	});

	it("shows eligible recent choices only for a bare slash", () => {
		const recent = ["columns-2", "task", "template", "quote", "link"];
		const where = { columns: false, templates: false, links: false };
		const rows = (q: string) =>
			filterSlashItems(q, where, recent)
				.filter((i) => i.section === "Recent")
				.map((i) => i.id);
		expect(rows("")).toEqual(["task", "quote"]);
		expect(rows("ta")).toEqual([]);
	});

	it("folds accents and ranks word prefixes ahead of ordered-letter matches", () => {
		expect(filterSlashItems("DÁT").map((i) => i.id)).toEqual([
			"database",
			"date",
		]);
		expect(filterSlashItems("síd")[0]?.id).toBe("columns-2");
		expect(filterSlashItems("bY")[0]?.id).toBe("columns-2");
		expect(filterSlashItems("hDg")[0]?.id).toBe("heading1");
	});

	it("puts the best match first, so Enter picks what was typed", () => {
		const ids = (q: string) => filterSlashItems(q).map((i) => i.label);
		// A label match beats an item that only has the word as a keyword.
		expect(ids("columns").slice(0, 2)).toEqual(["2 columns", "3 columns"]);
		expect(ids("columns")).toContain("Table");
		expect(ids("col")[0]).toBe("2 columns");
		// The label's start beats a later word in another label.
		expect(ids("call")[0]).toBe("Callout");
		expect(ids("data")[0]).toBe("Database");
		// A label that is exactly what was typed beats a longer one that starts the same way.
		expect(filterSlashItems("table").map((i) => i.id)).toEqual([
			"table",
			"toc",
		]);
	});

	it("shows everything for a bare slash", () => {
		expect(filterSlashItems("")).toEqual(SLASH_ITEMS);
	});

	it("filters by the start of a label word or a keyword, ignoring case", () => {
		expect(filterSlashItems("TODO").map((i) => i.id)).toEqual(["task"]);
		expect(filterSlashItems("list").map((i) => i.id)).toEqual([
			"bullet",
			"numbered",
		]);
	});

	it("finds dividers and each callout tone by name or keyword", () => {
		expect(
			filterSlashItems("hr")
				.slice(0, 2)
				.map((i) => i.id),
		).toEqual(["divider", "columns-3"]);
		expect(filterSlashItems("callout").map((i) => i.id)).toEqual([
			"callout-note",
			"callout-info",
			"callout-tip",
			"callout-warning",
			"callout-danger",
		]);
		expect(filterSlashItems("warn").map((i) => i.id)).toEqual([
			"callout-warning",
		]);
	});

	it("calls the code block Codeblock and still finds it by code, snippet and pre", () => {
		for (const query of ["code", "codeblock", "snippet", "pre"]) {
			expect(filterSlashItems(query)[0]?.id).toBe("code");
		}
		expect(SLASH_ITEMS.find((i) => i.id === "code")?.label).toBe("Codeblock");
	});

	it("finds the toggle by name or by what it does", () => {
		expect(filterSlashItems("tog").map((i) => i.id)).toEqual([
			"toggle-heading1",
			"toggle-heading2",
			"switch",
		]);
		expect(filterSlashItems("collapse").map((i) => i.id)).toEqual([
			"toggle",
			"toggle-heading1",
			"toggle-heading2",
		]);
		expect(filterSlashItems("fold").map((i) => i.id)).toEqual([
			"toggle",
			"toggle-heading1",
			"toggle-heading2",
		]);
	});

	it("finds the toggle headings among the headings, each at its own level", () => {
		expect(filterSlashItems("head").map((i) => i.id)).toEqual([
			"heading1",
			"heading2",
			"heading3",
			"heading4",
			"heading5",
			"heading6",
			"toggle-heading1",
			"toggle-heading2",
		]);
		expect(filterSlashItems("h2").map((i) => i.id)).toEqual([
			"heading2",
			"toggle-heading2",
		]);
	});

	it("finds nothing for a word that matches no item", () => {
		expect(filterSlashItems("zzz")).toEqual([]);
	});

	it("finds the column layouts, and leaves them out inside another block", () => {
		expect(filterSlashItems("column").map((i) => i.id)).toEqual([
			"columns-2",
			"columns-3",
			"table",
		]);
		expect(filterSlashItems("three").map((i) => i.id)).toEqual(["columns-3"]);
		expect(
			filterSlashItems("column", { columns: false }).map((i) => i.id),
		).toEqual(["table"]);
		expect(
			filterSlashItems("", { columns: false }).some((i) =>
				i.id.startsWith("columns-"),
			),
		).toBe(false);
		expect(filterSlashItems("")).toEqual(SLASH_ITEMS);
	});

	it("offers Template in the Organise section, and only where something can open the picker", () => {
		const template = SLASH_ITEMS.find((i) => i.id === "template");
		expect(template?.section).toBe("Organise");
		expect(filterSlashItems("templ").map((i) => i.id)).toEqual(["template"]);
		expect(filterSlashItems("starter").map((i) => i.id)).toEqual(["template"]);
		expect(
			filterSlashItems("templ", { columns: true, templates: false }),
		).toEqual([]);
		expect(
			filterSlashItems("", { columns: true, templates: false }).some(
				(i) => i.id === "template",
			),
		).toBe(false);
	});

	it("tags optional items with their feature", () => {
		const tagged = SLASH_ITEMS.filter((i) => i.feature).map((i) => [
			i.id,
			i.feature,
		]);
		expect(tagged).toEqual([
			["math", "math"],
			["frame", "canvas"],
			["template", "templates"],
			["database", "database-blocks"],
			...SLASH_ITEMS.filter((i) => i.section === "Visual").map((i) => [
				i.id,
				i.feature,
			]),
			["image", "images"],
			["guitar-tab", "music"],
			["sheet-music", "music"],
		]);
	});

	it("shows every item when no feature check is given, so features are on by default", () => {
		expect(filterSlashItems("math").map((i) => i.id)).toEqual(["math"]);
		expect(
			filterSlashItems("", { columns: true, enabled: () => true }),
		).toEqual(SLASH_ITEMS);
	});

	it("leaves out the items of a feature that is switched off, from the list and from Recent", () => {
		const off = new Set(["math", "database-blocks"]);
		const where = {
			columns: true,
			enabled: (featureId: string) => !off.has(featureId),
		};
		const ids = (q: string, recent: string[] = []) =>
			filterSlashItems(q, where, recent).map((i) => i.id);
		expect(ids("")).not.toContain("math");
		expect(ids("")).not.toContain("database");
		expect(ids("math")).toEqual([]);
		expect(ids("data")).toEqual([]);
		// A recent choice whose feature is off is not offered either; the others are.
		const recentRows = filterSlashItems("", where, ["math", "database", "task"])
			.filter((i) => i.section === "Recent")
			.map((i) => i.id);
		expect(recentRows).toEqual(["task"]);
		// Items with no feature are unaffected.
		expect(ids("heading")).toContain("heading1");
	});
});

it("keeps Table ahead of Table of contents for a short prefix", () => {
	expect(filterSlashItems("tab")[0]?.id).toBe("table");
});

it("offers Frame only when the surface and Canvas feature allow it", () => {
	const frames = (where: Parameters<typeof filterSlashItems>[1]) =>
		filterSlashItems("frame", where).some((item) => item.id === "frame");
	expect(frames({ columns: true, frames: true })).toBe(true);
	expect(frames({ columns: true, frames: false })).toBe(false);
	expect(frames({ columns: true, enabled: (id) => id !== "canvas" })).toBe(
		false,
	);
});
