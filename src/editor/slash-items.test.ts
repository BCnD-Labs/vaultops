import { describe, expect, it } from "vitest";
import { filterSlashItems, SLASH_ITEMS } from "./slash-items";

describe("slash menu items", () => {
	it("has exactly the agreed blocks, in order, with no separate task list", () => {
		expect(SLASH_ITEMS.map((i) => i.label)).toEqual([
			"Text",
			"Heading 1",
			"Heading 2",
			"Bulleted list",
			"Numbered list",
			"Task",
			"Code",
			"Quote",
		]);
		expect(SLASH_ITEMS.some((i) => /task list/i.test(i.label))).toBe(false);
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

	it("finds nothing for a word that matches no item", () => {
		expect(filterSlashItems("zzz")).toEqual([]);
	});
});
