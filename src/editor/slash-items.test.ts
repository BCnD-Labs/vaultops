import { describe, expect, it } from "vitest";
import { filterSlashItems, SLASH_ITEMS } from "./slash-items";

describe("slash menu items", () => {
	it("has exactly the agreed blocks, in order, with no separate task list", () => {
		expect(SLASH_ITEMS.map((i) => i.label)).toEqual([
			"Text",
			"Heading 1",
			"Heading 2",
			"Code",
			"Quote",
			"Divider",
			"Divider: dashed",
			"Divider: dotted",
			"Divider: thick",
			"Dropdown",
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
			"Date",
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

	it("shows everything for a bare slash", () => {
		expect(filterSlashItems("")).toEqual(SLASH_ITEMS);
	});

	it("filters by the start of a label word or a keyword, ignoring case", () => {
		expect(filterSlashItems("head").map((i) => i.id)).toEqual([
			"heading1",
			"heading2",
		]);
		expect(filterSlashItems("TODO").map((i) => i.id)).toEqual(["task"]);
		expect(filterSlashItems("h2").map((i) => i.id)).toEqual(["heading2"]);
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
		expect(filterSlashItems("tog").map((i) => i.id)).toEqual(["switch"]);
		expect(filterSlashItems("collapse").map((i) => i.id)).toEqual(["toggle"]);
		expect(filterSlashItems("fold").map((i) => i.id)).toEqual(["toggle"]);
	});

	it("finds nothing for a word that matches no item", () => {
		expect(filterSlashItems("zzz")).toEqual([]);
	});
});
