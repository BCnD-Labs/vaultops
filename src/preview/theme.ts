import { loadThemeChoice, type ThemeChoice } from "../ui/themes";

export function previewThemeChoice(
	search: string,
	stored = loadThemeChoice(),
): ThemeChoice {
	const params = new URLSearchParams(search);
	return loadThemeChoice({
		getItem: () =>
			JSON.stringify({
				id: params.get("theme") ?? stored.id,
				mode: params.get("mode") ?? stored.mode,
			}),
	});
}
