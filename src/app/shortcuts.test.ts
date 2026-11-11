// @vitest-environment happy-dom
import { afterEach, expect, it } from "vitest";
import { settings } from "./settings";
import {
	commandBinding,
	commandMatches,
	setRecordingShortcut,
} from "./shortcuts";

const press = (over: Partial<KeyboardEvent>) =>
	({
		key: "k",
		code: "KeyK",
		metaKey: false,
		ctrlKey: false,
		altKey: false,
		shiftKey: false,
		isComposing: false,
		repeat: false,
		...over,
	}) as KeyboardEvent;

afterEach(() => {
	settings.resetSection("shortcuts");
	localStorage.clear();
	setRecordingShortcut(false);
});

it("triggers every command with its default binding", () => {
	const cases: [string, Partial<KeyboardEvent>][] = [
		["command-bar", { key: "k", metaKey: true }],
		["toggle-left", { key: "\\", code: "Backslash", metaKey: true }],
		[
			"toggle-right",
			{ key: "|", code: "Backslash", metaKey: true, shiftKey: true },
		],
		["save", { key: "s", code: "KeyS", metaKey: true }],
		["debug", { key: "D", code: "KeyD", metaKey: true, shiftKey: true }],
	];
	for (const [id, event] of cases)
		expect(commandMatches(press(event), id, true), id).toBe(true);
});

it("follows a rebinding, stores only the change, and stops the old key", () => {
	settings.set("shortcuts.save" as never, "Mod+Alt+S" as never);
	expect(commandBinding("save")).toBe("Mod+Alt+S");
	const stored = JSON.parse(localStorage.getItem("vaultops.settings") ?? "{}");
	expect(Object.keys(stored).filter((k) => k.startsWith("shortcuts."))).toEqual(
		["shortcuts.save"],
	);
	expect(
		commandMatches(
			press({ key: "s", code: "KeyS", metaKey: true }),
			"save",
			true,
		),
	).toBe(false);
	expect(
		commandMatches(
			press({ key: "ß", code: "KeyS", metaKey: true, altKey: true }),
			"save",
			true,
		),
	).toBe(true);
	settings.reset("shortcuts.save" as never);
	expect(
		JSON.parse(localStorage.getItem("vaultops.settings") ?? "{}"),
	).not.toHaveProperty("shortcuts.save");
});

it("a cleared command never fires, and nothing fires while recording", () => {
	settings.set("shortcuts.save" as never, "" as never);
	expect(
		commandMatches(
			press({ key: "s", code: "KeyS", metaKey: true }),
			"save",
			true,
		),
	).toBe(false);
	settings.reset("shortcuts.save" as never);
	setRecordingShortcut(true);
	expect(
		commandMatches(
			press({ key: "s", code: "KeyS", metaKey: true }),
			"save",
			true,
		),
	).toBe(false);
});

it("loads saved settings that predate shortcuts", () => {
	localStorage.setItem(
		"vaultops.settings",
		JSON.stringify({ "editor.width": "7" }),
	);
	expect(commandBinding("command-bar")).toBe("Mod+K");
});
