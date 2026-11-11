import { expect, it } from "vitest";
import { loadLayout, saveLayout, sidebarShortcut } from "./shell-layout";

it("round-trips sizes including either or both collapsed sidebars", () => {
	let value: string | null = null;
	const storage = () => ({
		getItem: () => value,
		setItem: (_: string, next: string) => {
			value = next;
		},
	});
	expect(loadLayout(storage)).toBeUndefined();
	for (const layout of [
		{ left: 25, editor: 50, right: 25 },
		{ left: 0, editor: 75, right: 25 },
		{ left: 25, editor: 75, right: 0 },
		{ left: 0, editor: 100, right: 0 },
	]) {
		saveLayout(layout, storage);
		expect(loadLayout(storage)).toEqual(layout);
	}
	for (const invalid of [
		"broken",
		"null",
		"{}",
		'{"left":-1,"editor":101,"right":0}',
		'{"left":20,"editor":20,"right":20}',
		'{"left":"25","editor":50,"right":25}',
		'{"left":50,"editor":0,"right":50}',
	]) {
		value = invalid;
		expect(loadLayout(storage)).toBeUndefined();
	}
});

it("tolerates storage access, read and write failures", () => {
	const fail = () => {
		throw new Error("unavailable");
	};
	for (const storage of [fail, () => ({ getItem: fail, setItem: fail })]) {
		expect(loadLayout(storage)).toBeUndefined();
		expect(() =>
			saveLayout({ left: 0, editor: 100, right: 0 }, storage),
		).not.toThrow();
	}
});

it("matches only Command backslash shortcuts, including shifted key values", () => {
	const event = {
		key: "\\",
		code: "Backslash",
		metaKey: true,
		ctrlKey: false,
		altKey: false,
		shiftKey: false,
		isComposing: false,
		repeat: false,
	};
	expect(sidebarShortcut(event)).toBe("left");
	expect(sidebarShortcut({ ...event, shiftKey: true, key: "|" })).toBe("right");
	for (const change of [
		{ metaKey: false },
		{ ctrlKey: true },
		{ altKey: true },
		{ isComposing: true },
		{ repeat: true },
		{ key: "b", code: "KeyB" },
	]) {
		expect(sidebarShortcut({ ...event, ...change })).toBeNull();
	}
});
