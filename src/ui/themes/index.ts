/**
 * Each theme's name, the modes it supports, and a three-dot preview per mode
 * (page background, panel, accent) copied from the theme's CSS for the Theme
 * menu in Settings. Keep in step with the theme files when their colors change.
 */
export const themes = [
	{
		id: "default",
		name: "Mac flat",
		modes: ["light", "dark"],
		swatch: {
			light: ["#fafbfc", "#f0f2f5", "#0060df"],
			dark: ["#1b1d22", "#23262c", "#0a84ff"],
		},
	},
	{
		id: "graphite",
		name: "Graphite",
		modes: ["light", "dark"],
		swatch: {
			light: ["#fbfaf8", "#f2f0ed", "#57534e"],
			dark: ["#201f1d", "#282623", "#c7c2ba"],
		},
	},
	{
		id: "cards",
		name: "Cards",
		modes: ["light", "dark"],
		swatch: {
			light: ["#ffffff", "#fdfcfa", "#4b5fd6"],
			dark: ["#151412", "#201f1c", "#9aa8ff"],
		},
	},
	{
		id: "refined",
		name: "Refined",
		modes: ["light", "dark"],
		swatch: {
			light: ["#ffffff", "#f6f7f9", "#1a73e8"],
			dark: ["#111214", "#1a1b1e", "#8ab4f8"],
		},
	},
	{
		id: "clean",
		name: "Clean",
		modes: ["light", "dark"],
		swatch: {
			light: ["#ffffff", "#fcfcfd", "#1070c0"],
			dark: ["#121214", "#1c1c1f", "#4cb0ff"],
		},
	},
	{
		id: "glass",
		name: "Glass",
		modes: ["light", "dark"],
		swatch: {
			light: ["#ffffff", "#f6f6f9", "#0066d6"],
			dark: ["#161618", "#212124", "#0a84ff"],
		},
	},
	{
		id: "cosmos",
		name: "Cosmos",
		modes: ["light", "dark"],
		swatch: {
			light: ["#fbfcfe", "#f3f5fa", "#8f5a00"],
			dark: ["#04060b", "#0d1220", "#4fd8e8"],
		},
	},
	{
		id: "arcade",
		name: "Arcade",
		modes: ["light", "dark"],
		swatch: {
			light: ["#fffdf5", "#fbf7e8", "#c2410c"],
			dark: ["#08060f", "#160f29", "#ffd23f"],
		},
	},
	{
		id: "high-contrast",
		name: "High contrast",
		modes: ["light", "dark"],
		swatch: {
			light: ["#ffffff", "#fafafa", "#000000"],
			dark: ["#020202", "#101010", "#ffffff"],
		},
	},
	{
		id: "daylight",
		name: "Daylight",
		modes: ["light", "dark"],
		swatch: {
			light: ["#ffffff", "#eff2f5", "#0b4fb8"],
			dark: ["#2b2e33", "#353a41", "#5ca5ff"],
		},
	},
] as const;
export type ThemeChoice = { id: string; mode: "light" | "dark" | "system" };
const fallback: ThemeChoice = { id: "default", mode: "system" };
const key = "vaultops.theme";
function valid(value: unknown): value is ThemeChoice {
	if (!value || typeof value !== "object") return false;
	const choice = value as ThemeChoice;
	return (
		themes.some((theme) => theme.id === choice.id) &&
		["light", "dark", "system"].includes(choice.mode)
	);
}
export function applyTheme(
	root: Pick<HTMLElement, "setAttribute">,
	choice: ThemeChoice,
) {
	const selected = valid(choice) ? choice : fallback;
	root.setAttribute("data-theme", selected.id);
	// CSS media queries follow OS changes live when mode is system.
	root.setAttribute("data-mode", selected.mode);
}
export function loadThemeChoice(
	storage?: Pick<Storage, "getItem">,
): ThemeChoice {
	try {
		const choice: unknown = JSON.parse(
			(storage ?? localStorage).getItem(key) ?? "null",
		);
		return valid(choice) ? choice : { ...fallback };
	} catch {
		return { ...fallback };
	}
}
export function saveThemeChoice(
	choice: ThemeChoice,
	storage?: Pick<Storage, "setItem">,
) {
	try {
		(storage ?? localStorage).setItem(
			key,
			JSON.stringify(valid(choice) ? choice : fallback),
		);
	} catch {
		/* Storage may be disabled. */
	}
}
