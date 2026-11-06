import { applyFonts, loadFontChoice } from "./fonts";
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
	"quote",
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
	quote: "Quote block text",
	codeBackground: "Code block background",
	codeText: "Code text",
};

/** The theme variables each setting replaces. */
export const colorTokens: Record<ColorKey, readonly string[]> = {
	background: ["--shell-frame", "--shell-panel"],
	editorBackground: ["--editor-bg"],
	text: ["--editor-text"],
	bold: ["--editor-bold"],
	italic: ["--editor-italic"],
	quote: ["--editor-quote"],
	codeBackground: ["--editor-code-bg"],
	codeText: ["--editor-code-text"],
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

/** Apply the stored theme, mode and colors to the window. */
export function refreshAppearance(root: HTMLElement) {
	const choice = loadThemeChoice();
	applyTheme(root, choice);
	applyFonts(root, loadFontChoice());
	applyColors(root, loadColors()[resolveMode(choice.mode, systemIsDark())]);
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
