import { expect, it } from "vitest";
import { matchesNote, sortNotes, visibleTags } from "./list";

const row = {
	title: "Lecture",
	path: "a",
	preview: "Study the stars",
	tags: ["Science", "Work"],
};
it("matches title, preview and each tag case-insensitively with literal substrings", () => {
	for (const query of ["", "ECT", "THE STARS", "sci", "work"])
		expect(matchesNote(row, query)).toBe(true);
	for (const query of ["strs", "a.vnote", "Lecture Study", "Science Work"])
		expect(matchesNote(row, query)).toBe(false);
});
it("sorts both directions without mutating rows, breaking title ties by path", () => {
	const rows = [
		{ ...row, title: "banana" },
		{ ...row, title: "Apple", path: "z" },
		{ ...row, title: "apple", path: "b" },
	];
	expect(sortNotes(rows, "name-asc").map((r) => r.path)).toEqual([
		"b",
		"z",
		"a",
	]);
	expect(sortNotes(rows, "name-desc").map((r) => r.path)).toEqual([
		"a",
		"b",
		"z",
	]);
	expect(rows[0]?.title).toBe("banana");
});
it("shows at most two tags and counts the remaining tags", () => {
	for (let count = 0; count <= 4; count++) {
		const tags = ["a", "b", "c", "d"].slice(0, count);
		expect(visibleTags(tags)).toEqual({
			shown: tags.slice(0, 2),
			overflow: Math.max(0, count - 2),
		});
	}
});
