import { applyFonts, loadFontChoice } from "./fonts";
import { applyCustomCss, applyStyle, loadStyle } from "./style-tokens";
import { applyTheme, loadThemeChoice, type ThemeChoice } from "./themes";

/**
 * Light color customization on top of a theme. Each setting replaces one or
 * two theme variables (see `colorTokens`) with a color the user picked. The
 * choices are kept in localStorage, one set per resolved mode (light, dark),
 * so a color picked for light mode never lands on a dark background.
 */
export const colorKeys = [
	"background",
	"editorBackground",
	"text",
	"bold",
	"italic",
	"highlight",
	"selection",
	"headings",
	"listMarker",
	"listGuide",
	"quote",
	"quoteBar",
	"quoteBackground",
	"calloutNote",
	"calloutInfo",
	"calloutTip",
	"calloutWarning",
	"calloutDanger",
	"codeBackground",
	"codeText",
] as const;
export type ColorKey = (typeof colorKeys)[number];

export const colorLabels: Record<ColorKey, string> = {
	background: "Background (frame and side panels)",
	editorBackground: "Editor background",
	text: "Editor text",
	bold: "Bold text",
	italic: "Italic text",
	highlight: "Highlighted text background",
	selection: "Text selection",
	headings: "Heading text",
	listMarker: "List bullets and numbers",
	listGuide: "List indent guides",
	quote: "Quote block text",
	quoteBar: "Quote bar",
	quoteBackground: "Quote background",
	calloutNote: "Note callout",
	calloutInfo: "Info callout",
	calloutTip: "Tip callout",
	calloutWarning: "Warning callout",
	calloutDanger: "Danger callout",
	codeBackground: "Code block background",
	codeText: "Code text",
};

/** The settings card each color sits in, beside that part's other settings. */
export const colorGroups: Record<ColorKey, string> = {
	background: "Window and sidebars",
	editorBackground: "Editor",
	text: "Editor",
	bold: "Editor",
	italic: "Editor",
	highlight: "Editor",
	selection: "Editor",
	headings: "Headings",
	listMarker: "Lists",
	listGuide: "Lists",
	quote: "Quotes",
	quoteBar: "Quotes",
	quoteBackground: "Quotes",
	calloutNote: "Callouts",
	calloutInfo: "Callouts",
	calloutTip: "Callouts",
	calloutWarning: "Callouts",
	calloutDanger: "Callouts",
	codeBackground: "Code",
	codeText: "Code",
};

/** The theme variables each setting replaces. */
export const colorTokens: Record<ColorKey, readonly string[]> = {
	background: ["--shell-frame", "--shell-panel"],
	editorBackground: ["--editor-bg"],
	text: ["--editor-text"],
	bold: ["--editor-bold"],
	italic: ["--editor-italic"],
	highlight: ["--editor-highlight-bg"],
	selection: ["--selection-bg"],
	headings: ["--heading-color"],
	listMarker: ["--list-marker"],
	listGuide: ["--list-guide"],
	quote: ["--editor-quote"],
	quoteBar: ["--quote-bar-color"],
	quoteBackground: ["--quote-bg"],
	calloutNote: ["--callout-note-accent"],
	calloutInfo: ["--callout-info-accent"],
	calloutTip: ["--callout-tip-accent"],
	calloutWarning: ["--callout-warning-accent"],
	calloutDanger: ["--callout-danger-accent"],
	codeBackground: ["--editor-code-bg"],
	codeText: ["--editor-code-text"],
};

/**
 * What a color picker shows before a color is picked, for the settings whose
 * variable the themes leave unset (the part then falls back to this one).
 */
export const colorPreview: Partial<Record<ColorKey, string>> = {
	headings: "--editor-text",
	listMarker: "--editor-text",
	listGuide: "--line",
	quoteBar: "--primary",
	quoteBackground: "--surface-container",
};

export type ColorOverrides = Partial<Record<ColorKey, string>>;
export type ModeName = "light" | "dark";
export type AppearanceColors = Record<ModeName, ColorOverrides>;

const storageKey = "vaultops.appearance";
const opaqueHex = /^#[\da-f]{6}$/i;

export const noColors = (): AppearanceColors => ({ light: {}, dark: {} });

function cleanOverrides(value: unknown): ColorOverrides {
	const clean: ColorOverrides = {};
	if (!value || typeof value !== "object") return clean;
	for (const key of colorKeys) {
		const picked = (value as Record<string, unknown>)[key];
		if (typeof picked === "string" && opaqueHex.test(picked))
			clean[key] = picked.toLowerCase();
	}
	return clean;
}

export function loadColors(
	storage?: Pick<Storage, "getItem">,
): AppearanceColors {
	try {
		const stored: unknown = JSON.parse(
			(storage ?? localStorage).getItem(storageKey) ?? "null",
		);
		const source = (stored ?? {}) as Record<string, unknown>;
		return {
			light: cleanOverrides(source.light),
			dark: cleanOverrides(source.dark),
		};
	} catch {
		return noColors();
	}
}

export function saveColors(
	colors: AppearanceColors,
	storage?: Pick<Storage, "setItem">,
) {
	try {
		(storage ?? localStorage).setItem(
			storageKey,
			JSON.stringify({
				light: cleanOverrides(colors.light),
				dark: cleanOverrides(colors.dark),
			}),
		);
	} catch {
		/* Storage may be disabled; the colors then last until the window closes. */
	}
}

/** Editor column widths the Editor width setting offers; "theme" keeps the theme's own. */
export const EDITOR_WIDTHS = [
	["theme", "Match theme"],
	["600", "Narrow"],
	["720", "Standard"],
	["860", "Wide"],
	["1040", "Extra wide"],
] as const;

/**
 * The chosen editor width in pixels, or null for the theme's own. It lives in
 * the settings blob (`vaultops.settings`, field `editor.width`) that the
 * settings registry writes; this reader only needs that one field at startup.
 */
export function loadEditorWidth(
	storage?: Pick<Storage, "getItem">,
): number | null {
	try {
		const blob: unknown = JSON.parse(
			(storage ?? localStorage).getItem("vaultops.settings") ?? "null",
		);
		const raw = (blob as Record<string, unknown> | null)?.["editor.width"];
		return EDITOR_WIDTHS.some(([id]) => id !== "theme" && id === raw)
			? Number(raw)
			: null;
	} catch {
		return null;
	}
}

export function applyEditorWidth(
	root: Pick<HTMLElement, "style">,
	width: number | null,
) {
	if (width) root.style.setProperty("--editor-width", `${width}px`);
	else root.style.removeProperty("--editor-width");
}

/**
 * The editor text sizes the Text size settings change: body text and each
 * heading level, with the theme variable each one replaces. The theme's own
 * size is used until one is picked.
 */
export const TEXT_SIZES = [
	{ id: "body", label: "Body", variable: "--editor-font-size" },
	{ id: "h1", label: "Heading 1", variable: "--editor-h1-size" },
	{ id: "h2", label: "Heading 2", variable: "--editor-h2-size" },
	{ id: "h3", label: "Heading 3", variable: "--editor-h3-size" },
	{ id: "h4", label: "Heading 4", variable: "--editor-h4-size" },
	{ id: "h5", label: "Heading 5", variable: "--editor-h5-size" },
	{ id: "h6", label: "Heading 6", variable: "--editor-h6-size" },
] as const;
export type TextSizeId = (typeof TEXT_SIZES)[number]["id"];

/** The settings key of a text size (it lives in the `vaultops.settings` blob). */
export const textSizeKey = (id: TextSizeId) => `editor.size.${id}` as const;

/** The smallest and largest size, in pixels, the settings accept. */
export const TEXT_SIZE_MIN = 8;
export const TEXT_SIZE_MAX = 96;

/** The picked sizes in pixels; null means the theme's own. */
export type TextSizes = Record<TextSizeId, number | null>;

export function loadTextSizes(storage?: Pick<Storage, "getItem">): TextSizes {
	const sizes = Object.fromEntries(
		TEXT_SIZES.map(({ id }) => [id, null]),
	) as TextSizes;
	try {
		const blob = JSON.parse(
			(storage ?? localStorage).getItem("vaultops.settings") ?? "null",
		) as Record<string, unknown> | null;
		for (const { id } of TEXT_SIZES) {
			const raw = blob?.[textSizeKey(id)];
			if (typeof raw === "number" && raw >= TEXT_SIZE_MIN)
				sizes[id] = Math.min(raw, TEXT_SIZE_MAX);
		}
	} catch {
		/* Unreadable storage means every size is the theme's own. */
	}
	return sizes;
}

/** Set (or, for null, clear) each size's CSS variable, so open notes follow at once. */
export function applyTextSizes(
	root: Pick<HTMLElement, "style">,
	sizes: TextSizes,
) {
	for (const { id, variable } of TEXT_SIZES) {
		const px = sizes[id];
		if (px) root.style.setProperty(variable, `${px}px`);
		else root.style.removeProperty(variable);
	}
}

export function resolveMode(
	mode: ThemeChoice["mode"],
	systemIsDark: boolean,
): ModeName {
	if (mode === "system") return systemIsDark ? "dark" : "light";
	return mode;
}

export function systemIsDark(): boolean {
	return (
		typeof matchMedia === "function" &&
		matchMedia("(prefers-color-scheme: dark)").matches
	);
}

/** Replace exactly the given overrides: everything else goes back to the theme. */
export function applyColors(
	root: Pick<HTMLElement, "style">,
	overrides: ColorOverrides,
) {
	for (const key of colorKeys) {
		for (const token of colorTokens[key]) {
			const picked = overrides[key];
			if (picked) root.style.setProperty(token, picked);
			else root.style.removeProperty(token);
		}
	}
}

/**
 * The interface settings from the settings window (Appearance, Interface,
 * Editor), read from the `vaultops.settings` blob. Anything missing or not
 * one of the choices means the theme's own value.
 */
export interface InterfacePrefs {
	accent: string | null;
	uiSize: string | null;
	lineHeight: string | null;
	reduceMotion: boolean;
	statusBar: boolean;
	statusCounts: boolean;
	spellcheck: boolean;
	codeLineNumbers: boolean;
	codeWrapOption: boolean;
}

const UI_SIZES = ["11", "12", "13", "14"];
const LINE_HEIGHTS = ["1.4", "1.65", "1.9"];

export function loadInterface(
	storage?: Pick<Storage, "getItem">,
): InterfacePrefs {
	let blob: Record<string, unknown> = {};
	try {
		blob =
			(JSON.parse(
				(storage ?? localStorage).getItem("vaultops.settings") ?? "null",
			) as Record<string, unknown> | null) ?? {};
	} catch {
		/* Unreadable storage means the theme's own look. */
	}
	const pick = (key: string, allowed: string[]) => {
		const value = blob[key];
		return typeof value === "string" && allowed.includes(value) ? value : null;
	};
	const accent = blob["appearance.accent"];
	return {
		accent:
			typeof accent === "string" && opaqueHex.test(accent) ? accent : null,
		uiSize: pick("appearance.uiSize", UI_SIZES),
		lineHeight: pick("editor.lineHeight", LINE_HEIGHTS),
		reduceMotion: blob["appearance.reduceMotion"] === true,
		statusBar: blob["interface.statusBar"] !== false,
		statusCounts: blob["interface.statusCounts"] !== false,
		spellcheck: blob["editor.spellcheck"] !== false,
		codeLineNumbers: blob["editor.codeLineNumbers"] !== false,
		codeWrapOption: blob["editor.codeWrapOption"] !== false,
	};
}

/**
 * Apply the interface settings. Values go inline on the root element, so they
 * win over every theme's own; the show/hide ones become data attributes that
 * app.css reads. Spellcheck is set on the root, and every editable field below
 * it inherits it.
 */
export function applyInterface(root: HTMLElement, prefs: InterfacePrefs) {
	const set = (name: string, value: string | null) => {
		if (value) root.style.setProperty(name, value);
		else root.style.removeProperty(name);
	};
	set("--primary", prefs.accent);
	set("--ring", prefs.accent);
	set("--size-ui", prefs.uiSize && `${prefs.uiSize}px`);
	set("--editor-line-height", prefs.lineHeight);
	set("--motion-fast", prefs.reduceMotion ? "0ms" : null);
	set("--motion-normal", prefs.reduceMotion ? "0ms" : null);
	root.toggleAttribute("data-reduce-motion", prefs.reduceMotion);
	root.toggleAttribute("data-hide-status-bar", !prefs.statusBar);
	root.toggleAttribute("data-hide-status-counts", !prefs.statusCounts);
	root.toggleAttribute("data-hide-code-numbers", !prefs.codeLineNumbers);
	root.toggleAttribute("data-hide-code-wrap", !prefs.codeWrapOption);
	root.setAttribute("spellcheck", String(prefs.spellcheck));
}

/** Apply the stored theme, mode and colors to the window. */
export function refreshAppearance(root: HTMLElement) {
	const choice = loadThemeChoice();
	applyTheme(root, choice);
	applyFonts(root, loadFontChoice());
	applyColors(root, loadColors()[resolveMode(choice.mode, systemIsDark())]);
	applyEditorWidth(root, loadEditorWidth());
	applyTextSizes(root, loadTextSizes());
	applyInterface(root, loadInterface());
	const stored = loadStyle();
	applyStyle(root, stored);
	applyCustomCss(
		root.ownerDocument,
		typeof stored["themes.customCss"] === "string"
			? stored["themes.customCss"]
			: "",
	);
}

/** Apply at startup and follow the system light/dark setting while mode is System. */
export function startAppearance(root: HTMLElement) {
	refreshAppearance(root);
	if (typeof matchMedia !== "function") return;
	matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () =>
		refreshAppearance(root),
	);
}

export function toHex(red: number, green: number, blue: number): string {
	const part = (n: number) =>
		Math.max(0, Math.min(255, Math.round(n)))
			.toString(16)
			.padStart(2, "0");
	return `#${part(red)}${part(green)}${part(blue)}`;
}

/**
 * The color the window currently shows for a theme variable, as #rrggbb, for
 * the color picker. Returns black when the browser cannot resolve it (tests).
 */
export function currentColor(token: string, root: HTMLElement): string {
	const raw = getComputedStyle(root).getPropertyValue(token).trim();
	if (opaqueHex.test(raw)) return raw.toLowerCase();
	const probe = root.ownerDocument.createElement("span");
	probe.style.color = raw;
	root.appendChild(probe);
	const resolved = getComputedStyle(probe).color;
	probe.remove();
	const channels = resolved.match(/\d+(\.\d+)?/g);
	if (!raw || !channels || channels.length < 3) return toHex(0, 0, 0);
	return toHex(Number(channels[0]), Number(channels[1]), Number(channels[2]));
}
