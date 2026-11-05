import { describe, expect, it } from "vitest";
import { NEW_TAB } from "../core/workspace";
import {
	dropIndex,
	landingIndex,
	nudgeTab,
	TAB_DRAG_TYPE,
	tabDragData,
} from "./tab-drag";

const transfer = (value: string | null, types: string[] = [TAB_DRAG_TYPE]) => ({
	types,
	getData: () => value ?? "",
});

describe("tabDragData", () => {
	it("reads a tab drag", () => {
		expect(
			tabDragData(transfer(JSON.stringify({ path: "a.vnote", from: "left" }))),
		).toEqual({ path: "a.vnote", from: "left" });
	});

	it("ignores drags of anything else", () => {
		expect(
			tabDragData(transfer("{}", ["application/x-vaultops-block"])),
		).toBeNull();
		expect(tabDragData(transfer("a.vnote", ["text/plain"]))).toBeNull();
	});

	it("rejects malformed payloads and the empty tab", () => {
		for (const bad of [
			"not json",
			"null",
			JSON.stringify({ path: "", from: "left" }),
			JSON.stringify({ path: "a.vnote", from: "middle" }),
			JSON.stringify({ path: NEW_TAB, from: "left" }),
			JSON.stringify({ from: "left" }),
		])
			expect(tabDragData(transfer(bad))).toBeNull();
	});
});

describe("dropIndex", () => {
	const middles = [50, 150, 250];
	it("lands before the first tab whose middle is to the right", () => {
		expect(dropIndex(middles, 10)).toBe(0);
		expect(dropIndex(middles, 100)).toBe(1);
		expect(dropIndex(middles, 200)).toBe(2);
	});

	it("lands at the end past the last middle, and in an empty strip", () => {
		expect(dropIndex(middles, 300)).toBe(3);
		expect(dropIndex([], 10)).toBe(0);
	});
});

describe("landingIndex", () => {
	const tabs = ["a", "b", "c", "d"];
	it("counts without the dragged tab inside its own strip", () => {
		// Drag a to just before d: the workspace sees [b, c, d], so index 2.
		expect(landingIndex(tabs, { path: "a", from: "left" }, "left", 3)).toBe(2);
		// Dragging d to the front is unchanged.
		expect(landingIndex(tabs, { path: "d", from: "left" }, "left", 0)).toBe(0);
		// Dropping a on its own right edge leaves it where it is.
		expect(landingIndex(tabs, { path: "a", from: "left" }, "left", 1)).toBe(0);
	});

	it("counts without the empty tab for a tab from the other pane", () => {
		const withEmpty = ["a", NEW_TAB, "b"];
		expect(
			landingIndex(withEmpty, { path: "x", from: "right" }, "left", 3),
		).toBe(2);
		expect(
			landingIndex(withEmpty, { path: "x", from: "right" }, "left", 1),
		).toBe(1);
		expect(
			landingIndex(withEmpty, { path: "x", from: "right" }, "left", 0),
		).toBe(0);
	});
});

describe("nudgeTab", () => {
	const tabs = ["a", "b", "c"];
	it("moves a tab one place inside its strip", () => {
		expect(nudgeTab("left", tabs, "b", 1, false)).toEqual({
			kind: "reorder",
			index: 2,
		});
		expect(nudgeTab("left", tabs, "b", -1, false)).toEqual({
			kind: "reorder",
			index: 0,
		});
	});

	it("carries the left pane's last tab across, opening the split if needed", () => {
		expect(nudgeTab("left", tabs, "c", 1, false)).toEqual({
			kind: "pane",
			to: "right",
			index: 0,
		});
		expect(nudgeTab("left", tabs, "c", 1, true)).toEqual({
			kind: "pane",
			to: "right",
			index: 0,
		});
	});

	it("carries the right pane's first tab back to the left pane's end", () => {
		expect(nudgeTab("right", tabs, "a", -1, true)).toEqual({
			kind: "pane",
			to: "left",
		});
	});

	it("does nothing when there is nowhere to go", () => {
		expect(nudgeTab("left", ["a"], "a", 1, false)).toBeNull();
		expect(nudgeTab("left", tabs, "a", -1, false)).toBeNull();
		expect(nudgeTab("right", tabs, "c", 1, true)).toBeNull();
		expect(nudgeTab("left", tabs, "missing", 1, false)).toBeNull();
		expect(nudgeTab("left", [NEW_TAB, "a"], NEW_TAB, 1, true)).toBeNull();
	});
});
