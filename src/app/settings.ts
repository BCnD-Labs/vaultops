import { DATE_FORMATS, type PlaceholderFormats } from "../core/notes/templates";
import {
	CHECK_IN_SLOTS,
	type CheckInSlot,
	DEFAULT_STARTS,
	resolveConfig,
	SLOT_LABEL,
} from "../core/planner/check-in";
import {
	createSettings,
	type SettingDef,
	type SettingsStorage,
} from "../core/settings/registry";
import { SHORTCUT_SETTING_DEFS } from "../core/settings/shortcuts";
import {
	type ColorKey,
	colorGroups,
	colorKeys,
	colorLabels,
	EDITOR_WIDTHS,
	type ModeName,
	TEXT_SIZE_MAX,
	TEXT_SIZES,
	textSizeKey,
} from "../ui/appearance";
import { editorFonts, headingFonts } from "../ui/fonts";
import { STYLE_TOKENS } from "../ui/style-tokens";
import { themes } from "../ui/themes";

const option = ([value, label]: readonly [string, string]) => ({
	value,
	label,
});

const timeOptions = Array.from({ length: 48 }, (_, i) => {
	const t = `${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`;
	return { value: t, label: t };
});

const checkInToggle = (slot: CheckInSlot) => ({
	section: "planner",
	group: "Daily check-ins",
	label: `${SLOT_LABEL[slot]} check-in`,
	description: `Show the ${slot} check-in on the daily log.`,
	type: "toggle" as const,
	default: true,
	keywords: ["journal", "log", "check in", "mood", "energy", "focus", slot],
	sparse: true as const,
});

const checkInStart = (slot: CheckInSlot) => ({
	section: "planner",
	group: "Daily check-ins",
	label: `${SLOT_LABEL[slot]} starts at`,
	description:
		"When this check-in becomes the current one. Start times must rise through the day, or the defaults are used.",
	type: "select" as const,
	default: DEFAULT_STARTS[slot],
	options: timeOptions,
	keywords: ["journal", "log", "check in", "time", "boundary", slot],
	sparse: true as const,
});

const COLOR_STORE = "vaultops.appearance";

const colorDefs = (["light", "dark"] as const).flatMap((mode: ModeName) =>
	colorKeys.map((key: ColorKey) => ({
		key: `themes.color.${mode}.${key}`,
		section: "themes",
		label: colorLabels[key],
		group: colorGroups[key],
		type: "color" as const,
		default: "",
		keywords: ["color", "colour", "customize", mode],
		store: { key: COLOR_STORE, path: [mode, key] },
		sparse: true,
	})),
);

/**
 * Settings > Themes style settings (ui/style-tokens.ts): a "Theme" choice that
 * leaves the theme alone, then the presets; switches are on by default.
 */
const styleDefs = STYLE_TOKENS.map((token) =>
	token.kind === "select"
		? {
				key: token.key,
				section: "themes",
				group: token.group,
				label: token.label,
				description: token.description,
				type: "select" as const,
				default: "theme",
				options: [
					{ value: "theme", label: "Theme" },
					...token.choices.map(({ value, label }) => ({ value, label })),
				],
				keywords: token.keywords ?? [],
				sparse: true,
			}
		: {
				key: token.key,
				section: "themes",
				group: token.group,
				label: token.label,
				description: token.description,
				type: "toggle" as const,
				default: true,
				keywords: token.keywords ?? [],
				sparse: true,
			},
);

/**
 * One setting per editor text size, in pixels. 0 (the default) means the theme's
 * own size, so nothing is overridden until a size is picked. The Text size
 * rows in the Editor section draw these; the generic list leaves them out.
 */
const textSizeDefs = TEXT_SIZES.map(({ id, label }) => ({
	key: textSizeKey(id),
	section: "editor",
	group: "Text size",
	label: `${label} size`,
	description: "In pixels. Changes show in open notes at once.",
	type: "number" as const,
	default: 0,
	min: 0,
	max: TEXT_SIZE_MAX,
	step: 1,
	keywords: ["font size", "text size", "heading", "body", "px", id],
	sparse: true as const,
}));

/** Snap choices, saved under the canvas toolbar's own key and values. */
const SNAP_STORED: Record<string, string> = {
	true: "grid",
	both: "both",
	objects: "objects",
	false: "off",
};

/**
 * Settings added with the 2026-11-10 settings cleanup. Each one takes effect
 * in the app: the look ones through `applyInterface` (ui/appearance.ts), the
 * rest where they are read.
 */
const NEW_DEFS = [
	{
		key: "appearance.accent",
		section: "appearance",
		group: "Look",
		label: "Accent color",
		description:
			"The color of buttons, focus rings and highlights. Leave it to use the theme's.",
		type: "color",
		default: "",
		keywords: ["accent", "primary", "highlight", "color", "colour"],
		sparse: true,
	},
	{
		key: "appearance.uiSize",
		section: "appearance",
		group: "Fonts",
		label: "Interface text size",
		description:
			"Text size in the sidebars, menus and toolbars. Note text has its own sizes under Editor.",
		type: "select",
		default: "theme",
		options: [
			{ value: "theme", label: "Theme" },
			{ value: "11", label: "Small" },
			{ value: "12", label: "Medium" },
			{ value: "13", label: "Large" },
			{ value: "14", label: "Larger" },
		],
		keywords: ["font size", "ui", "zoom", "sidebar", "menu"],
		sparse: true,
	},
	{
		key: "appearance.reduceMotion",
		section: "appearance",
		group: "Look",
		label: "Reduce motion",
		description: "Turn off animations, such as menus and folders sliding open.",
		type: "toggle",
		default: false,
		keywords: ["animation", "motion", "accessibility"],
		sparse: true,
	},
	{
		key: "interface.statusBar",
		section: "interface",
		group: "Status bar",
		label: "Show status bar",
		description: "The bar along the bottom of the editor.",
		type: "toggle",
		default: true,
		keywords: ["footer", "bottom bar"],
		sparse: true,
	},
	{
		key: "interface.statusCounts",
		section: "interface",
		group: "Status bar",
		label: "Word and character count",
		description: "Show the open note's counts in the status bar.",
		type: "toggle",
		default: true,
		keywords: ["words", "characters", "count", "stats"],
		sparse: true,
	},
	{
		key: "editor.lineHeight",
		section: "editor",
		group: "Display",
		label: "Line spacing",
		description: "Space between lines of note text.",
		type: "select",
		default: "theme",
		options: [
			{ value: "theme", label: "Theme" },
			{ value: "1.4", label: "Compact" },
			{ value: "1.65", label: "Comfortable" },
			{ value: "1.9", label: "Roomy" },
		],
		keywords: ["line height", "leading", "spacing", "density"],
		sparse: true,
	},
	{
		key: "editor.spellcheck",
		section: "editor",
		group: "Behavior",
		label: "Spellcheck",
		description: "Underline misspelled words, using the system's spellchecker.",
		type: "toggle",
		default: true,
		keywords: ["spelling", "spell check", "typo"],
		sparse: true,
	},
	{
		key: "editor.codeLineNumbers",
		section: "editor",
		group: "Code blocks",
		label: "Line numbers in code blocks",
		description: "A number beside each line of code. It is never copied.",
		type: "toggle",
		default: true,
		keywords: ["code", "codeblock", "gutter", "lines", "numbers"],
		sparse: true,
	},
	{
		key: "editor.codeWrapOption",
		section: "editor",
		group: "Code blocks",
		label: "Wrap option in code blocks",
		description:
			"A Wrap button on each code block, to wrap long lines. Turn it off and every block scrolls sideways. Blocks keep their wrap choice either way.",
		type: "toggle",
		default: true,
		keywords: ["code", "codeblock", "wrap", "word wrap", "long lines"],
		sparse: true,
	},
	{
		key: "files.newNoteLocation",
		section: "files",
		group: "New notes",
		label: "Where new notes go",
		description:
			"For the New note buttons and Cmd K. Right-click a folder to make a note there whatever this says.",
		type: "select",
		default: "selected",
		options: [
			{ value: "selected", label: "Selected folder" },
			{ value: "root", label: "Vault root" },
			{ value: "folder", label: "Folder below" },
		],
		keywords: ["default location", "inbox", "new note", "folder"],
		sparse: true,
	},
	{
		key: "files.newNoteFolder",
		section: "files",
		group: "New notes",
		label: "Folder for new notes",
		description:
			"Used when new notes go in the folder below, for example _Inbox. If it doesn't exist, notes go in the vault root.",
		type: "text",
		default: "",
		maxLength: 200,
		keywords: ["inbox", "default folder", "new note"],
		sparse: true,
	},
	{
		key: "templates.dateFormat",
		section: "templates",
		group: "Placeholders",
		label: "Date format",
		description: "How {{date}} is written when a template is used.",
		type: "select",
		default: "YYYY-MM-DD",
		options: DATE_FORMATS.map((value) => ({ value, label: value })),
		keywords: ["date", "{{date}}", "placeholder", "format"],
		sparse: true,
	},
	{
		key: "templates.timeFormat",
		section: "templates",
		group: "Placeholders",
		label: "Time format",
		description: "How {{time}} is written when a template is used.",
		type: "select",
		default: "24h",
		options: [
			{ value: "24h", label: "24-hour (14:05)" },
			{ value: "12h", label: "12-hour (2:05 PM)" },
		],
		keywords: ["time", "{{time}}", "placeholder", "format", "am", "pm"],
		sparse: true,
	},
	{
		key: "canvas.snap",
		section: "canvas",
		group: "Moving cards",
		label: "Snap",
		description:
			"What cards line up with while you move or resize them. The canvas toolbar changes the same setting.",
		type: "select",
		default: "off",
		options: [
			{ value: "off", label: "Off" },
			{ value: "grid", label: "Grid" },
			{ value: "objects", label: "Other cards" },
			{ value: "both", label: "Both" },
		],
		keywords: ["snap to grid", "snap to objects", "align", "canvas"],
		store: {
			key: "vaultops:canvas-snap",
			path: [],
			raw: {
				decode: (text) => (text === null ? undefined : SNAP_STORED[text]),
				encode: (value) =>
					value === "grid" ? "true" : value === "off" ? "false" : String(value),
			},
		},
	},
] as const satisfies readonly SettingDef[];

/**
 * Every setting the app has. The three storage keys below predate the registry
 * and keep their shape, so a saved choice loads unchanged.
 */
export const SETTING_DEFS = [
	{
		key: "appearance.mode",
		section: "appearance",
		group: "Look",
		label: "Mode",
		description: "Light, dark, or follow the system.",
		type: "select",
		default: "system",
		options: [
			{ value: "light", label: "Light" },
			{ value: "dark", label: "Dark" },
			{ value: "system", label: "System" },
		],
		keywords: ["dark mode", "light mode", "night"],
		store: { key: "vaultops.theme", path: ["mode"] },
	},
	{
		key: "themes.theme",
		section: "themes",
		group: "Theme",
		label: "Theme",
		description: "The overall look of the app.",
		type: "select",
		default: "default",
		options: themes.map((theme) => ({ value: theme.id, label: theme.name })),
		keywords: ["look", "style"],
		store: { key: "vaultops.theme", path: ["id"] },
	},
	{
		key: "editor.font",
		section: "editor",
		group: "Display",
		label: "Editor font",
		description: "The font you write in.",
		type: "font",
		default: "theme",
		options: editorFonts.map(option),
		keywords: ["typeface", "text"],
		store: { key: "vaultops.fonts", path: ["editor"] },
	},
	{
		key: "appearance.headingFont",
		section: "appearance",
		group: "Fonts",
		label: "Titles, tags and headings",
		description: "The font for titles, tags and headings.",
		type: "font",
		default: "theme",
		options: headingFonts.map(option),
		keywords: ["typeface", "heading font", "title font"],
		store: { key: "vaultops.fonts", path: ["heading"] },
	},
	{
		key: "editor.width",
		section: "editor",
		group: "Display",
		label: "Editor width",
		description:
			"How wide the text column is. Match theme uses the theme's own.",
		type: "select",
		default: "theme",
		options: EDITOR_WIDTHS.map(([value, label]) => ({ value, label })),
		keywords: ["column", "measure", "line length", "wide", "narrow"],
		sparse: true,
	},
	{
		// Saved as "1" (title bar) or "0" (sidebar) under its old key.
		key: "appearance.calendarPlacement",
		section: "interface",
		group: "Calendar",
		label: "Calendar",
		description:
			"Where the calendar sits: in the title bar, or in the sidebar.",
		type: "select",
		default: "titlebar",
		options: [
			{ value: "titlebar", label: "Title bar" },
			{ value: "sidebar", label: "Sidebar" },
		],
		keywords: ["planner", "title bar", "sidebar", "dock", "placement"],
		store: {
			key: "vaultops:calendar-button",
			path: [],
			raw: {
				decode: (text) =>
					text === null ? undefined : text === "1" ? "titlebar" : "sidebar",
				encode: (value) => (value === "titlebar" ? "1" : "0"),
			},
		},
	},
	{
		// Saved as "planner" or "right" under its old key; the old "left" is unknown and falls back.
		key: "appearance.calendarDock",
		section: "interface",
		group: "Calendar",
		label: "Sidebar calendar position",
		description:
			"When the calendar is in the sidebar: inside the planner, or below the right sidebar's tools.",
		type: "select",
		default: "planner",
		options: [
			{ value: "planner", label: "In the planner" },
			{ value: "right", label: "Below the tools" },
		],
		keywords: ["calendar", "dock", "placement", "sidebar"],
		store: {
			key: "vaultops:calendar-dock",
			path: [],
			raw: { decode: (text) => text ?? undefined, encode: String },
		},
	},
	{
		key: "planner.weekStartsOn",
		section: "planner",
		group: "Calendar",
		label: "Week starts on",
		description: "The first day of the week in the calendar and the journal.",
		type: "select",
		default: "sunday",
		options: [
			{ value: "sunday", label: "Sunday" },
			{ value: "monday", label: "Monday" },
		],
		keywords: ["week", "monday", "sunday", "first day", "calendar"],
	},
	{ key: "planner.checkIn.morning", ...checkInToggle("morning") },
	{ key: "planner.checkIn.morningStart", ...checkInStart("morning") },
	{ key: "planner.checkIn.afternoon", ...checkInToggle("afternoon") },
	{ key: "planner.checkIn.afternoonStart", ...checkInStart("afternoon") },
	{ key: "planner.checkIn.evening", ...checkInToggle("evening") },
	{ key: "planner.checkIn.eveningStart", ...checkInStart("evening") },
	...NEW_DEFS,
	...styleDefs,
	{
		key: "themes.customCss",
		section: "themes",
		group: "Custom CSS",
		label: "Custom CSS",
		description:
			"Your own CSS, applied on top of the theme and the settings above. It can override any theme variable, for example :root { --primary: tomato; }. Links to the internet (@import, url()) are left out.",
		type: "text",
		default: "",
		maxLength: 20000,
		multiline: true,
		keywords: ["css", "snippet", "custom", "style", "advanced"],
		sparse: true,
	},
	...textSizeDefs,
	...colorDefs,
	...SHORTCUT_SETTING_DEFS,
] as const satisfies readonly SettingDef[];

/** `localStorage` where there is one (always, in the app); memory in a bare test run. */
const browserStorage: SettingsStorage = {
	getItem: (key) =>
		typeof localStorage === "undefined" ? null : localStorage.getItem(key),
	setItem: (key, value) => {
		if (typeof localStorage !== "undefined") localStorage.setItem(key, value);
	},
	removeItem: (key) => {
		if (typeof localStorage !== "undefined") localStorage.removeItem(key);
	},
};

export const settings = createSettings(SETTING_DEFS, browserStorage);

/** Day of the week the calendar starts on: 0 = Sunday, 1 = Monday. */
export const weekStartsOnValue = (value: string): 0 | 1 =>
	value === "monday" ? 1 : 0;

/** The check-in settings as the planner's config (overlapping times fall back to defaults). */
export function checkInConfig(
	read: {
		[K in
			| `planner.checkIn.${CheckInSlot}`
			| `planner.checkIn.${CheckInSlot}Start`]: string | boolean;
	},
) {
	const enabled: Partial<Record<CheckInSlot, boolean>> = {};
	const starts: Partial<Record<CheckInSlot, string>> = {};
	for (const slot of CHECK_IN_SLOTS) {
		enabled[slot] = read[`planner.checkIn.${slot}`] === true;
		starts[slot] = String(read[`planner.checkIn.${slot}Start`]);
	}
	return resolveConfig({ enabled, starts });
}

/** The `{{date}}` and `{{time}}` formats picked under Templates. */
export function templateFormats(): PlaceholderFormats {
	return {
		date: settings.get("templates.dateFormat") as PlaceholderFormats["date"],
		time: settings.get("templates.timeFormat") as PlaceholderFormats["time"],
	};
}

/**
 * The folder a new note goes in, given the folder selected in the sidebar,
 * following "Where new notes go". A named folder that isn't in the vault
 * falls back to the vault root.
 */
export function newNoteFolder(selected: string, folders: readonly string[]) {
	const where = settings.get("files.newNoteLocation");
	if (where === "root") return "";
	if (where === "folder") {
		const named = String(settings.get("files.newNoteFolder"))
			.trim()
			.replace(/^\/+|\/+$/g, "");
		return folders.includes(named) ? named : "";
	}
	return selected;
}
