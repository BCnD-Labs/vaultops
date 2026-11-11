import { describe, expect, it } from "vitest";
import { filterSlashItems, SLASH_ITEMS } from "./slash-items";

describe("slash menu items", () => {
	it("has exactly the agreed blocks, in order, with no separate task list", () => {
		expect(SLASH_ITEMS.map((i) => i.label)).toEqual([
			"Text",
			"Heading 1",
			"Heading 2",
			"Heading 3",
			"Heading 4",
			"Heading 5",
			"Heading 6",
			"Code",
			"Quote",
			"Divider",
			"Divider: dashed",
			"Divider: dotted",
			"Divider: thick",
			"Dropdown",
			"Toggle heading 1",
			"Toggle heading 2",
			"Toggle",
			"Bulleted list",
			"Numbered list",
			"Task",
			"Callout",
			"Callout: info",
			"Callout: tip",
			"Callout: warning",
			"Callout: danger",
			"Table",
			"Database",
			"2 columns",
			"3 columns",
			"Date",
			"Link",
			"Mention a resource",
			"Template",
		]);
		expect(SLASH_ITEMS.some((i) => /task list/i.test(i.label))).toBe(false);
	});

	it("keeps each section together and gives every item an icon", () => {
		const sections = SLASH_ITEMS.map((i) => i.section);
		expect(sections.filter((s, i) => s !== sections[i - 1])).toEqual([
			"Blocks",
			"Lists",
			"Callouts",
			"Insert",
		]);
		expect(SLASH_ITEMS.every((i) => i.icon)).toBe(true);
		expect(filterSlashItems("table").map((i) => i.id)).toEqual(["table"]);
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
		expect(filterSlashItems("hr").map((i) => i.id)).toEqual(["divider"]);
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

	it("offers Template in the Insert section, and only where something can open the picker", () => {
		const template = SLASH_ITEMS.find((i) => i.id === "template");
		expect(template?.section).toBe("Insert");
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
});
