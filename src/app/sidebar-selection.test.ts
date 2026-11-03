import { afterEach, expect, it, vi } from "vitest";
import {
	selectedNotes,
	selectionForPath,
	sidebarPreferences,
} from "./sidebar-selection";

const rows = [
	{ path: "Root.vnote", tags: ["Work"] },
	{ path: "Class/A.vnote", tags: [] },
	{ path: "Class/Week/B.vnote", tags: ["work"] },
];
afterEach(() => vi.unstubAllGlobals());
it("lists all notes, direct folder children, root children and case-insensitive tags", () => {
	expect(selectedNotes(rows, { kind: "all" })).toEqual(rows);
	expect(selectedNotes(rows, { kind: "folder", value: "Class" })).toEqual([
		rows[1],
	]);
	expect(selectedNotes(rows, { kind: "folder", value: "" })).toEqual([rows[0]]);
	expect(selectedNotes(rows, { kind: "folder", value: "Empty" })).toEqual([]);
	expect(selectedNotes(rows, { kind: "tag", value: "WORK" })).toEqual([
		rows[0],
		rows[2],
	]);
});
it("follows an opened path to its containing folder", () => {
	expect(selectionForPath("Root.vnote")).toEqual({ kind: "folder", value: "" });
	expect(selectionForPath("Class/Week/B.vnote")).toEqual({
		kind: "folder",
		value: "Class/Week",
	});
});
it("remembers layout and sizes and tolerates invalid or unavailable storage", () => {
	let saved = "null";
	vi.stubGlobal("localStorage", {
		getItem: () => saved,
		setItem: (_key: string, value: string) => {
			saved = value;
		},
	});
	const preferences = {
		orientation: "horizontal" as const,
		sizes: { navigation: 40, notes: 60 },
	};
	sidebarPreferences(preferences);
	expect(sidebarPreferences()).toEqual(preferences);
	for (const bad of [
		"{",
		"{}",
		'{"orientation":"vertical","sizes":{"navigation":-1,"notes":101}}',
	]) {
		saved = bad;
		expect(sidebarPreferences().orientation).toBe("vertical");
	}
	vi.stubGlobal("localStorage", {
		getItem: () => {
			throw Error();
		},
		setItem: () => {
			throw Error();
		},
	});
	expect(sidebarPreferences().sizes).toEqual({ navigation: 50, notes: 50 });
	expect(sidebarPreferences(preferences)).toEqual(preferences);
});
