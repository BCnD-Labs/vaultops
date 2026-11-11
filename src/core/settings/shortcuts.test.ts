import { expect, it } from "vitest";
import {
	bindingFromEvent,
	bindingProblem,
	canonicalBinding,
	findConflict,
	formatKeys,
	hintKeys,
	type KeyEventLike,
	matchesBinding,
	parseBinding,
	SHORTCUT_COMMANDS,
} from "./shortcuts";

const press = (over: Partial<KeyEventLike>): KeyEventLike => ({
	key: "k",
	code: "KeyK",
	metaKey: false,
	ctrlKey: false,
	altKey: false,
	shiftKey: false,
	isComposing: false,
	repeat: false,
	...over,
});

it("parses and normalizes bindings", () => {
	expect(parseBinding("Mod+Shift+k")).toMatchObject({
		mod: true,
		shift: true,
		key: "K",
	});
	expect(canonicalBinding("Shift+Mod+k")).toBe("Mod+Shift+K");
	expect(parseBinding("Mod+\\")?.key).toBe("\\");
	expect(parseBinding("Mod++")?.key).toBe("+");
	expect(parseBinding("")).toBeNull();
	expect(parseBinding("Mod+")).toBeNull();
	expect(parseBinding("Mod")).toBeNull();
});

it("formats for each platform", () => {
	expect(formatKeys("Mod+Shift+D", true)).toBe("⌘⇧D");
	expect(formatKeys("Mod+Shift+D", false)).toBe("Ctrl+Shift+D");
	expect(formatKeys("Mod+Alt+Left", true)).toBe("⌘⌥←");
	expect(hintKeys("Mod+K", true)).toBe("Cmd K");
	expect(hintKeys("Mod+K", false)).toBe("Ctrl K");
	expect(hintKeys("", true)).toBe("");
});

it("matches Mod as Cmd on a Mac and Ctrl elsewhere, with exact modifiers", () => {
	const cmd = press({ metaKey: true });
	const ctrl = press({ ctrlKey: true });
	expect(matchesBinding(cmd, "Mod+K", true)).toBe(true);
	expect(matchesBinding(cmd, "Mod+K", false)).toBe(false);
	expect(matchesBinding(ctrl, "Mod+K", false)).toBe(true);
	expect(matchesBinding(ctrl, "Mod+K", true)).toBe(false);
	expect(matchesBinding(press({ ctrlKey: true }), "Ctrl+K", true)).toBe(true);
	expect(matchesBinding({ ...cmd, shiftKey: true }, "Mod+K", true)).toBe(false);
	expect(matchesBinding({ ...cmd, altKey: true }, "Mod+K", true)).toBe(false);
	expect(
		matchesBinding({ ...cmd, shiftKey: true, key: "K" }, "Mod+Shift+K", true),
	).toBe(true);
	expect(matchesBinding({ ...cmd, ctrlKey: true }, "Mod+K", true)).toBe(false);
});

it("ignores IME composition, held keys (unless allowed) and empty bindings", () => {
	const cmd = press({ metaKey: true });
	expect(matchesBinding({ ...cmd, isComposing: true }, "Mod+K", true)).toBe(
		false,
	);
	expect(matchesBinding({ ...cmd, repeat: true }, "Mod+K", true)).toBe(false);
	expect(matchesBinding({ ...cmd, repeat: true }, "Mod+K", true, true)).toBe(
		true,
	);
	expect(matchesBinding(cmd, "", true)).toBe(false);
});

it("matches punctuation by physical key, including shifted and Option keys", () => {
	const slash = press({ key: "\\", code: "Backslash", metaKey: true });
	expect(matchesBinding(slash, "Mod+\\", true)).toBe(true);
	expect(
		matchesBinding(
			{ ...slash, key: "|", shiftKey: true },
			"Mod+Shift+\\",
			true,
		),
	).toBe(true);
	expect(
		matchesBinding(
			press({ key: "˚", code: "KeyK", metaKey: true, altKey: true }),
			"Mod+Alt+K",
			true,
		),
	).toBe(true);
	expect(
		matchesBinding(press({ key: "Enter", ctrlKey: true }), "Mod+Enter", false),
	).toBe(true);
});

it("turns a key press into a binding", () => {
	expect(bindingFromEvent(press({ metaKey: true }), true)).toBe("Mod+K");
	expect(
		bindingFromEvent(
			press({ key: "|", code: "Backslash", metaKey: true, shiftKey: true }),
			true,
		),
	).toBe("Mod+Shift+\\");
	expect(bindingFromEvent(press({ ctrlKey: true }), true)).toBe("Ctrl+K");
	expect(bindingFromEvent(press({ ctrlKey: true }), false)).toBe("Mod+K");
	expect(bindingFromEvent(press({ metaKey: true }), false)).toBeNull();
	expect(
		bindingFromEvent(press({ key: "Meta", code: "MetaLeft" }), true),
	).toBeNull();
	// Option+K types another character; the physical key still names it.
	expect(
		bindingFromEvent(
			press({ key: "˚", code: "KeyK", metaKey: true, altKey: true }),
			true,
		),
	).toBe("Mod+Alt+K");
});

it("refuses bindings that would break typing", () => {
	expect(bindingProblem("K")).not.toBeNull();
	expect(bindingProblem("Shift+K")).not.toBeNull();
	expect(bindingProblem("Mod+K")).toBeNull();
	expect(bindingProblem("F5")).toBeNull();
	expect(bindingProblem("nonsense with spaces")).not.toBeNull();
});

it("finds the other command that uses a binding", () => {
	const defaults = (id: string) =>
		SHORTCUT_COMMANDS.find((c) => c.id === id)?.keys ?? "";
	expect(findConflict("save", "Mod+K", defaults)?.id).toBe("command-bar");
	expect(findConflict("save", "mod+k", defaults)?.id).toBe("command-bar");
	expect(findConflict("command-bar", "Mod+K", defaults)).toBeUndefined();
	expect(findConflict("save", "", defaults)).toBeUndefined();
});

it("has unique ids and unique default bindings", () => {
	const ids = SHORTCUT_COMMANDS.map((c) => c.id);
	expect(new Set(ids).size).toBe(ids.length);
	const keys = SHORTCUT_COMMANDS.map((c) => canonicalBinding(c.keys));
	expect(new Set(keys).size).toBe(keys.length);
});
