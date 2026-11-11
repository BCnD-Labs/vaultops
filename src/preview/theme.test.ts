import { expect, it } from "vitest";
import { themes } from "../ui/themes";
import { previewThemeChoice } from "./theme";

const stored = { id: "graphite", mode: "dark" } as const;
it.each(themes)("reads preview URL modes for $id", ({ id }) => {
	for (const mode of ["light", "dark", "system"] as const) {
		expect(previewThemeChoice(`?theme=${id}&mode=${mode}`, stored)).toEqual({
			id,
			mode,
		});
	}
});
it("keeps stored choices for omitted parameters without saving URL overrides", () => {
	expect(previewThemeChoice("", stored)).toEqual(stored);
	expect(previewThemeChoice("?mode=light", stored)).toEqual({
		id: "graphite",
		mode: "light",
	});
	expect(previewThemeChoice("?theme=high-contrast", stored)).toEqual({
		id: "high-contrast",
		mode: "dark",
	});
	expect(stored).toEqual({ id: "graphite", mode: "dark" });
});
it("falls back for invalid URL choices", () => {
	for (const search of ["?theme=unknown", "?mode=invalid"]) {
		expect(previewThemeChoice(search, stored)).toEqual({
			id: "default",
			mode: "system",
		});
	}
});
