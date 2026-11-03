import { type ThemeChoice, themes } from "../ui/themes";

/** URL overrides are preview-only; never persist them as an app preference. */
export function previewThemeChoice(
	search: string,
	saved: ThemeChoice,
): ThemeChoice {
	const params = new URLSearchParams(search);
	const theme = themes.find((theme) => theme.id === params.get("theme"));
	const mode = params.get("mode");
	return {
		id: theme?.id ?? saved.id,
		mode:
			mode === "light" || mode === "dark" || mode === "system"
				? mode
				: saved.mode,
	};
}
