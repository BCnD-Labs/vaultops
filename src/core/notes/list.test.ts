import { expect, it } from "vitest";
import {
	filterNotes,
	groupNotes,
	matchesNote,
	sortNotes,
	visibleTags,
} from "./list";

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

it("filters tagged and untagged notes without changing input or order", () => {
	const plain = { ...row, tags: [] };
	const rows = [row, plain];
	expect(filterNotes(rows, "All")).toEqual(rows);
	expect(filterNotes(rows, "Tagged")).toEqual([row]);
	expect(filterNotes(rows, "Untagged")).toEqual([plain]);
	expect(rows).toEqual([row, plain]);
	expect(filterNotes([], "Tagged")).toEqual([]);
});
it("groups by full parent path, root first, preserving note sort order", () => {
	const rows = [
		"z/b.vnote",
		"a/nested/b.vnote",
		"root.vnote",
		"z/a.vnote",
		"a/b.vnote",
	].map((path) => ({ ...row, path }));
	expect(
		groupNotes(rows).map(([folder, notes]) => [
			folder,
			notes.map((n) => n.path),
		]),
	).toEqual([
		["", ["root.vnote"]],
		["a", ["a/b.vnote"]],
		["a/nested", ["a/nested/b.vnote"]],
		["z", ["z/b.vnote", "z/a.vnote"]],
	]);
	expect(groupNotes([])).toEqual([]);
});
