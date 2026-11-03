import { expect, it, vi } from "vitest";
import { applyTheme, themes } from "../ui/themes";
import { previewThemeChoice } from "./theme";

const saved = { id: "default", mode: "system" } as const;
it("applies every preview theme and mode from the URL", () => {
	for (const { id } of themes) {
		for (const mode of ["light", "dark", "system"] as const) {
			const setAttribute = vi.fn();
			applyTheme(
				{ setAttribute },
				previewThemeChoice(`?theme=${id}&mode=${mode}`, saved),
			);
			expect(setAttribute.mock.calls).toEqual([
				["data-theme", id],
				["data-mode", mode],
			]);
		}
	}
});
it("uses saved values for missing or invalid overrides independently", () => {
	expect(previewThemeChoice("", saved)).toEqual(saved);
	expect(previewThemeChoice("?theme=unknown&mode=nope", saved)).toEqual(saved);
	expect(previewThemeChoice("?theme=graphite", saved)).toEqual({
		id: "graphite",
		mode: "system",
	});
	expect(previewThemeChoice("?theme=unknown&mode=light", saved)).toEqual({
		id: "default",
		mode: "light",
	});
	expect(previewThemeChoice("?theme=high-contrast&mode=nope", saved)).toEqual({
		id: "high-contrast",
		mode: "system",
	});
	expect(saved).toEqual({ id: "default", mode: "system" });
});
