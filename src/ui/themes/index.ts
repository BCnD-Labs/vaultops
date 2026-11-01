export const themes = [
	{ id: "default", name: "Mac flat", modes: ["light", "dark"] },
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
