/**
 * The app's keyboard shortcuts, as one list, plus the one key-matching helper
 * every place that handles keys calls. Pure TypeScript: no window, no storage.
 *
 * A binding is written `Mod+Shift+K`: modifiers (`Mod`, `Ctrl`, `Alt`, `Shift`)
 * and one key, joined by `+`. `Mod` is Cmd on a Mac and Ctrl elsewhere; `Ctrl`
 * is always the Control key. An empty string means "no shortcut".
 *
 * Each command becomes a `shortcut` setting (`shortcuts.<id>`) so rebinding,
 * reset and export/import all go through the settings registry. Only changed
 * bindings are stored.
 */
import type { SettingDef } from "./registry";

export interface ShortcutCommand {
	id: string;
	label: string;
	/** The group it is listed under in the settings window. */
	section: string;
	/** The default binding. */
	keys: string;
	where: string;
}

export const SHORTCUT_COMMANDS: readonly ShortcutCommand[] = [
	{
		id: "command-bar",
		label: "Open the command bar",
		section: "Navigation",
		keys: "Mod+K",
		where: "Anywhere",
	},
	{
		id: "toggle-left",
		label: "Toggle the left sidebar",
		section: "Navigation",
		keys: "Mod+\\",
		where: "Anywhere, even in the editor",
	},
	{
		id: "toggle-right",
		label: "Toggle the right sidebar",
		section: "Navigation",
		keys: "Mod+Shift+\\",
		where: "Anywhere, even in the editor",
	},
	{
		id: "save",
		label: "Save open notes now",
		section: "Notes",
		keys: "Mod+S",
		where: "Anywhere",
	},
	{
		id: "debug",
		label: "Open the maintainer panel",
		section: "Maintainer",
		keys: "Mod+Shift+D",
		where: "Maintainer builds only",
	},
];

/** The editor's own formatting keys. They live in the editor and are not rebindable. */
export const EDITOR_SHORTCUTS: readonly {
	id: string;
	label: string;
	keys: string;
}[] = [
	{ id: "bold", label: "Bold", keys: "Mod+B" },
	{ id: "italic", label: "Italic", keys: "Mod+I" },
	{ id: "underline", label: "Underline", keys: "Mod+U" },
	{ id: "code", label: "Inline code", keys: "Mod+E" },
	{ id: "kbd", label: "Keyboard key", keys: "Mod+Alt+K" },
	{ id: "list-nest", label: "Nest list item under the one above", keys: "Tab" },
	{ id: "list-unnest", label: "Move list item out a level", keys: "Shift+Tab" },
	{ id: "list-up", label: "Move list item up", keys: "Mod+Shift+Up" },
	{ id: "list-down", label: "Move list item down", keys: "Mod+Shift+Down" },
	{
		id: "move-out",
		label: "Move block out of its parent",
		keys: "Mod+Alt+Left",
	},
	{ id: "undo", label: "Undo", keys: "Mod+Z" },
	{ id: "redo", label: "Redo", keys: "Mod+Shift+Z" },
];

export const shortcutKey = (id: string): `shortcuts.${string}` =>
	`shortcuts.${id}`;

/** The registry definitions for the commands: sparse, so only changes are stored. */
export const SHORTCUT_SETTING_DEFS = SHORTCUT_COMMANDS.map((command) => ({
	key: shortcutKey(command.id),
	section: "shortcuts",
	label: command.label,
	description: command.where,
	group: command.section,
	type: "shortcut" as const,
	default: command.keys,
	keywords: ["shortcut", "keyboard", "keys", "binding"],
	sparse: true,
})) satisfies readonly SettingDef[];

export interface Binding {
	mod: boolean;
	ctrl: boolean;
	alt: boolean;
	shift: boolean;
	key: string;
}

const MODIFIER_NAMES = new Set(["Mod", "Ctrl", "Alt", "Shift"]);
const KEY_ALIASES: Record<string, string> = {
	space: "Space",
	esc: "Escape",
	escape: "Escape",
	left: "ArrowLeft",
	right: "ArrowRight",
	up: "ArrowUp",
	down: "ArrowDown",
};

const normalizeName = (text: string) =>
	text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();

function normalizeKey(key: string): string {
	if (key.length === 1) return key.toUpperCase();
	return KEY_ALIASES[key.toLowerCase()] ?? key;
}

/** Read a binding string; null when it is empty or not a key combination. */
export function parseBinding(text: string): Binding | null {
	let rest = text.trim();
	const binding: Binding = {
		mod: false,
		ctrl: false,
		alt: false,
		shift: false,
		key: "",
	};
	for (;;) {
		const found = /^(Mod|Ctrl|Alt|Shift)\+(?=.)/i.exec(rest);
		if (!found) break;
		binding[
			(found[1] ?? "").toLowerCase() as "mod" | "ctrl" | "alt" | "shift"
		] = true;
		rest = rest.slice(found[0].length);
	}
	if (
		rest === "" ||
		/\s/.test(rest) ||
		(rest.length > 1 && rest.endsWith("+")) ||
		MODIFIER_NAMES.has(normalizeName(rest))
	)
		return null;
	binding.key = normalizeKey(rest);
	return binding;
}

function write(binding: Binding): string {
	return [
		binding.mod && "Mod",
		binding.ctrl && "Ctrl",
		binding.alt && "Alt",
		binding.shift && "Shift",
		binding.key,
	]
		.filter(Boolean)
		.join("+");
}

/** The one spelling of a binding, so `mod+k` and `Mod+K` compare equal. */
export function canonicalBinding(text: string): string {
	const parsed = parseBinding(text);
	return parsed ? write(parsed) : "";
}

/** Why a binding cannot be used, or null. A bare letter would break typing. */
export function bindingProblem(text: string): string | null {
	const parsed = parseBinding(text);
	if (!parsed) return "That is not a key combination.";
	if (
		!parsed.mod &&
		!parsed.ctrl &&
		!parsed.alt &&
		!/^F\d{1,2}$/.test(parsed.key)
	)
		return "Hold Cmd, Ctrl or Alt as well, so typing still works.";
	return null;
}

const KEY_SYMBOLS: Record<string, string> = {
	ArrowLeft: "←",
	ArrowRight: "→",
	ArrowUp: "↑",
	ArrowDown: "↓",
	Escape: "Esc",
};
const keySymbol = (key: string) => KEY_SYMBOLS[key] ?? key;

/** Show a binding the way the platform writes it: ⌘⇧K on a Mac, Ctrl+Shift+K elsewhere. */
export function formatKeys(keys: string, mac: boolean): string {
	const parsed = parseBinding(keys);
	if (!parsed) return keys;
	const key = keySymbol(parsed.key);
	if (mac)
		return `${parsed.mod ? "⌘" : ""}${parsed.ctrl ? "⌃" : ""}${parsed.alt ? "⌥" : ""}${parsed.shift ? "⇧" : ""}${key}`;
	return [
		(parsed.mod || parsed.ctrl) && "Ctrl",
		parsed.alt && "Alt",
		parsed.shift && "Shift",
		key,
	]
		.filter(Boolean)
		.join("+");
}

/** A short spaced hint such as `Cmd K` for buttons; empty when there is no binding. */
export function hintKeys(keys: string, mac: boolean): string {
	const parsed = parseBinding(keys);
	if (!parsed) return "";
	return [
		parsed.ctrl && "Ctrl",
		parsed.mod && (mac ? "Cmd" : "Ctrl"),
		parsed.alt && (mac ? "Opt" : "Alt"),
		parsed.shift && "Shift",
		keySymbol(parsed.key),
	]
		.filter(Boolean)
		.join(" ");
}

export type KeyEventLike = Pick<
	KeyboardEvent,
	"key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey" | "isComposing"
> & { code?: string; repeat?: boolean };

const PUNCTUATION_CODES: Record<string, string> = {
	"\\": "Backslash",
	"-": "Minus",
	"=": "Equal",
	",": "Comma",
	".": "Period",
	"/": "Slash",
	";": "Semicolon",
	"'": "Quote",
	"[": "BracketLeft",
	"]": "BracketRight",
	"`": "Backquote",
};
const CODE_PUNCTUATION = Object.fromEntries(
	Object.entries(PUNCTUATION_CODES).map(([key, code]) => [code, key]),
);

function keyMatches(event: KeyEventLike, key: string): boolean {
	if (key.length === 1 && /[A-Z]/.test(key)) {
		if (event.key.toLowerCase() === key.toLowerCase()) return true;
		// Option on a Mac types another character, so fall back to the physical key.
		return event.altKey && event.code === `Key${key}`;
	}
	if (/^\d$/.test(key))
		return event.key === key || event.code === `Digit${key}`;
	const code = PUNCTUATION_CODES[key];
	if (code) return event.code === code || event.key === key;
	if (key === "Space") return event.key === " ";
	return event.key.toLowerCase() === key.toLowerCase();
}

/**
 * Whether a key event is this binding. Modifiers must match exactly (an extra
 * Shift or Alt is no match). Ignored while an IME is composing and, unless
 * `allowRepeat`, while a key is held down.
 */
export function matchesBinding(
	event: KeyEventLike,
	binding: string,
	mac: boolean,
	allowRepeat = false,
): boolean {
	if (event.isComposing || (event.repeat && !allowRepeat)) return false;
	const parsed = parseBinding(binding);
	if (!parsed) return false;
	const wantMeta = parsed.mod && mac;
	const wantCtrl = parsed.ctrl || (parsed.mod && !mac);
	return (
		event.metaKey === wantMeta &&
		event.ctrlKey === wantCtrl &&
		event.altKey === parsed.alt &&
		event.shiftKey === parsed.shift &&
		keyMatches(event, parsed.key)
	);
}

const MODIFIER_KEYS = new Set(["Shift", "Control", "Alt", "Meta", "AltGraph"]);

/**
 * The binding a key press spells, for recording a new shortcut. Null while only
 * modifiers are held, and for Meta on a non-Mac (there is no `Meta` binding).
 */
export function bindingFromEvent(
	event: KeyEventLike,
	mac: boolean,
): string | null {
	if (MODIFIER_KEYS.has(event.key)) return null;
	if (event.metaKey && !mac) return null;
	let key: string;
	const code = event.code ?? "";
	if (/^Key[A-Z]$/.test(code)) key = code.slice(3);
	else if (/^Digit\d$/.test(code)) key = code.slice(5);
	else if (CODE_PUNCTUATION[code]) key = CODE_PUNCTUATION[code];
	else if (event.key === " ") key = "Space";
	else key = normalizeKey(event.key);
	return write({
		mod: mac ? event.metaKey : event.ctrlKey,
		ctrl: mac ? event.ctrlKey : false,
		alt: event.altKey,
		shift: event.shiftKey,
		key,
	});
}

/** The command that already has this binding, other than `id`; undefined if free. */
export function findConflict(
	id: string,
	binding: string,
	current: (id: string) => string,
): ShortcutCommand | undefined {
	const wanted = canonicalBinding(binding);
	if (wanted === "") return undefined;
	return SHORTCUT_COMMANDS.find(
		(command) =>
			command.id !== id && canonicalBinding(current(command.id)) === wanted,
	);
}
