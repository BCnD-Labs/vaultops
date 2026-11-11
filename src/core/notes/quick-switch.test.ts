import { expect, it } from "vitest";
import { createRowTitle, matchNoteText, matchNoteTitles } from "./quick-switch";

it("orders title prefixes before substrings, ignoring case and preserving ties", () => {
	const rows = [
		"A project",
		"Project two",
		"My project",
		"project one",
		"Other",
	].map((title, index) => ({ title, path: String(index) }));
	expect(matchNoteTitles(rows, "PROJECT").map((row) => row.title)).toEqual([
		"Project two",
		"project one",
		"A project",
		"My project",
	]);
	expect(matchNoteTitles(rows, "other").map((row) => row.title)).toEqual([
		"Other",
	]);
	expect(matchNoteTitles(rows, " ")).toEqual(rows);
	expect(rows[0]?.title).toBe("A project");
});

it("offers creation only for a nonempty query with no title match", () => {
	expect(createRowTitle("  New idea  ", [])).toBe("New idea");
	expect(createRowTitle("  ", [])).toBeNull();
	expect(createRowTitle("Idea", [{ title: "Idea" }])).toBeNull();
});

it("still offers creation next to notes that only contain the words", () => {
	expect(createRowTitle("Math", [{ title: "Math 101" }])).toBe("Math");
	// An exact title, whatever its case, is the note itself.
	expect(createRowTitle("math 101", [{ title: "Math 101" }])).toBeNull();
});

it("finds notes by words in their text, with a snippet, skipping canvases and listed titles", () => {
	const rows = [
		{ path: "a.vnote", text: "The quick brown fox jumps over the lazy dog" },
		{ path: "b.vnote", text: "nothing here" },
		{ path: "c.vnote", kind: "canvas", text: "fox on a canvas" },
		{ path: "d.vnote", text: "a fox again" },
		{ path: "e.vnote" },
	];
	const hits = matchNoteText(rows, "FOX");
	expect(hits.map((h) => h.row.path)).toEqual(["a.vnote", "d.vnote"]);
	expect(hits[0]?.snippet).toContain("fox");
	expect(
		matchNoteText(rows, "fox", new Set(["a.vnote"])).map((h) => h.row.path),
	).toEqual(["d.vnote"]);
	// One character is too much noise.
	expect(matchNoteText(rows, "f")).toEqual([]);
	expect(matchNoteText(rows, "fox", new Set(), 1)).toHaveLength(1);
});

it("puts an ellipsis where the snippet is cut", () => {
	const text = `${"x ".repeat(60)}needle${" y".repeat(60)}`;
	const [hit] = matchNoteText([{ path: "n.vnote", text }], "needle");
	expect(hit?.snippet.startsWith("…")).toBe(true);
	expect(hit?.snippet.endsWith("…")).toBe(true);
	expect(hit?.snippet).toContain("needle");
});
