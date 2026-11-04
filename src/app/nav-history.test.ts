import { expect, it } from "vitest";
import {
	canGoBack,
	canGoForward,
	EMPTY_NAV,
	NAV_LIMIT,
	pruneEntries,
	renameEntry,
	step,
	visit,
} from "./nav-history";

const trail = (...paths: string[]) => paths.reduce(visit, EMPTY_NAV);

it("starts empty and records each opened note", () => {
	expect(canGoBack(EMPTY_NAV)).toBe(false);
	expect(canGoForward(EMPTY_NAV)).toBe(false);
	expect(trail("a")).toEqual({ entries: ["a"], index: 0 });
	const two = trail("a", "b");
	expect(two).toEqual({ entries: ["a", "b"], index: 1 });
	expect(canGoBack(two)).toBe(true);
	expect(canGoForward(two)).toBe(false);
});

it("ignores opening the note that is already current", () => {
	const history = trail("a", "b");
	expect(visit(history, "b")).toBe(history);
});

it("steps back and forward, and stops at both ends", () => {
	const history = trail("a", "b", "c");
	const back = step(history, -1);
	expect(back?.path).toBe("b");
	expect(back && canGoForward(back.history)).toBe(true);
	const twice = back && step(back.history, -1);
	expect(twice?.path).toBe("a");
	expect(twice && step(twice.history, -1)).toBeNull();
	const forward = twice && step(twice.history, 1);
	expect(forward?.path).toBe("b");
	expect(step(history, 1)).toBeNull();
	expect(step(EMPTY_NAV, -1)).toBeNull();
});

it("drops the forward part when a new note is opened from the middle", () => {
	const middle = step(trail("a", "b", "c"), -1)?.history;
	expect(middle && visit(middle, "d")).toEqual({
		entries: ["a", "b", "d"],
		index: 2,
	});
});

it("keeps only the newest entries past the limit", () => {
	let history = EMPTY_NAV;
	for (let i = 0; i < NAV_LIMIT + 5; i++) history = visit(history, `n${i}`);
	expect(history.entries).toHaveLength(NAV_LIMIT);
	expect(history.entries[0]).toBe("n5");
	expect(history.index).toBe(NAV_LIMIT - 1);
});

it("follows a rename and collapses a note that now appears twice in a row", () => {
	expect(renameEntry(trail("a", "b", "c"), "b", "x")).toEqual({
		entries: ["a", "x", "c"],
		index: 2,
	});
	expect(renameEntry(trail("a", "b"), "b", "a")).toEqual({
		entries: ["a"],
		index: 0,
	});
	const same = trail("a");
	expect(renameEntry(same, "q", "r")).toBe(same);
});

it("forgets missing notes and stays on the same note, or the nearest earlier one", () => {
	const history = trail("a", "b", "c", "d");
	expect(pruneEntries(history, ["a", "b", "c", "d"])).toBe(history);
	expect(pruneEntries(history, ["a", "c", "d"])).toEqual({
		entries: ["a", "c", "d"],
		index: 2,
	});
	// The current note (d) is gone: land on the nearest earlier one that is left.
	expect(pruneEntries(history, ["a", "b"])).toEqual({
		entries: ["a", "b"],
		index: 1,
	});
	// Removing the middle can leave the same note twice in a row.
	expect(pruneEntries(trail("a", "b", "a"), ["a"])).toEqual({
		entries: ["a"],
		index: 0,
	});
	expect(pruneEntries(history, [])).toEqual(EMPTY_NAV);
	// Everything before the current note is gone: land on the first entry left.
	const first = step(step(history, -1)?.history ?? history, -1)?.history;
	expect(first && pruneEntries(first, ["c", "d"])).toEqual({
		entries: ["c", "d"],
		index: 0,
	});
});
