import { expect, it } from "vitest";
import { noteName, savePointSummary } from "./summary";

it("names up to two notes and counts the rest", () => {
	expect(savePointSummary([])).toBe("");
	expect(
		savePointSummary([{ path: "Notes/Trip plan.vnote", kind: "modified" }]),
	).toBe("Edited Trip plan");
	expect(
		savePointSummary([
			{ path: "a.vnote", kind: "modified" },
			{ path: "b.vnote", kind: "untracked" },
		]),
	).toBe("Edited a and b");
	expect(
		savePointSummary([
			{ path: "a.vnote", kind: "untracked" },
			{ path: "b.vnote", kind: "added" },
			{ path: "attachments/x.png", kind: "untracked" },
		]),
	).toBe("Added a, b (+1 more)");
	expect(savePointSummary([{ path: "gone.vnote", kind: "deleted" }])).toBe(
		"Removed gone",
	);
});

it("falls back to files when no note changed", () => {
	expect(
		savePointSummary([{ path: ".vaultops/pinned.json", kind: "modified" }]),
	).toBe("Changed pinned.json");
	expect(
		savePointSummary([
			{ path: "attachments/a.png", kind: "untracked" },
			{ path: "attachments/b.png", kind: "untracked" },
		]),
	).toBe("Changed 2 files");
	expect(noteName("Journal/2026-11-24.vnote")).toBe("2026-11-24");
});
