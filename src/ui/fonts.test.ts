// @vitest-environment happy-dom
import { expect, it } from "vitest";
import { applyFonts, loadFontChoice, saveFontChoice } from "./fonts";

function store() {
	const data = new Map<string, string>();
	return {
		getItem: (k: string) => data.get(k) ?? null,
		setItem: (k: string, v: string) => void data.set(k, v),
	};
}

it("defaults to the theme's fonts and ignores junk", () => {
	const s = store();
	expect(loadFontChoice(s)).toEqual({ editor: "theme", heading: "theme" });
	s.setItem("vaultops.fonts", '{"editor":"comic","heading":7}');
	expect(loadFontChoice(s)).toEqual({ editor: "theme", heading: "theme" });
});

it("remembers a choice and applies it as root attributes, clearing on theme", () => {
	const s = store();
	saveFontChoice({ editor: "atkinson", heading: "inter" }, s);
	const choice = loadFontChoice(s);
	const root = document.createElement("div");
	applyFonts(root, choice);
	expect(root.getAttribute("data-editor-font")).toBe("atkinson");
	expect(root.getAttribute("data-heading-font")).toBe("inter");
	applyFonts(root, { editor: "theme", heading: "theme" });
	expect(root.hasAttribute("data-editor-font")).toBe(false);
	expect(root.hasAttribute("data-heading-font")).toBe(false);
});
