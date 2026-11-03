import { expect, it } from "vitest";
import { createRowTitle, matchNoteTitles } from "./quick-switch";

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
