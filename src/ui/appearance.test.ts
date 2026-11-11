// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	applyColors,
	applyTextSizes,
	colorKeys,
	colorTokens,
	loadColors,
	loadTextSizes,
	noColors,
	refreshAppearance,
	resolveMode,
	saveColors,
	toHex,
} from "./appearance";
import { saveThemeChoice } from "./themes";

afterEach(() => {
	localStorage.clear();
	document.documentElement.removeAttribute("style");
	vi.unstubAllGlobals();
});

describe("stored colors", () => {
	it("round trips per mode and lower-cases colors", () => {
		saveColors({ light: { text: "#AABBCC" }, dark: { bold: "#112233" } });
		expect(loadColors()).toEqual({
			light: { text: "#aabbcc" },
			dark: { bold: "#112233" },
		});
	});

	it("drops anything that is not an opaque #rrggbb color or a known setting", () => {
		localStorage.setItem(
			"vaultops.appearance",
			JSON.stringify({
				light: {
					text: "red",
					bold: "#fff",
					italic: "#12345678",
					quote: 5,
					unknown: "#112233",
					codeText: "#445566",
				},
				dark: "nope",
			}),
		);
		expect(loadColors()).toEqual({
			light: { codeText: "#445566" },
			dark: {},
		});
	});

	it("falls back to no colors for corrupt or missing storage", () => {
		for (const bad of ["{oops", "null", "[]", "7"]) {
			localStorage.setItem("vaultops.appearance", bad);
			expect(loadColors()).toEqual(noColors());
		}
		expect(loadColors({ getItem: () => null })).toEqual(noColors());
	});

	it("survives storage that throws", () => {
		const fail = () => {
			throw new Error("disabled");
		};
		expect(loadColors({ getItem: fail })).toEqual(noColors());
		expect(() => saveColors(noColors(), { setItem: fail })).not.toThrow();
	});
});

describe("applying colors", () => {
	it("sets the theme variables of each pick and clears the rest", () => {
		const root = document.documentElement;
		applyColors(root, { background: "#101010", text: "#fafafa" });
		expect(root.style.getPropertyValue("--shell-frame")).toBe("#101010");
		expect(root.style.getPropertyValue("--shell-panel")).toBe("#101010");
		expect(root.style.getPropertyValue("--editor-text")).toBe("#fafafa");
		applyColors(root, { bold: "#ff0000" });
		expect(root.style.getPropertyValue("--editor-text")).toBe("");
		expect(root.style.getPropertyValue("--shell-frame")).toBe("");
		expect(root.style.getPropertyValue("--editor-bold")).toBe("#ff0000");
		applyColors(root, {});
		for (const key of colorKeys)
			for (const token of colorTokens[key])
				expect(root.style.getPropertyValue(token)).toBe("");
	});

	it("uses the colors saved for the resolved mode", () => {
		const root = document.documentElement;
		saveColors({ light: { text: "#111111" }, dark: { text: "#eeeeee" } });
		saveThemeChoice({ id: "default", mode: "dark" });
		refreshAppearance(root);
		expect(root.getAttribute("data-mode")).toBe("dark");
		expect(root.style.getPropertyValue("--editor-text")).toBe("#eeeeee");
		saveThemeChoice({ id: "graphite", mode: "light" });
		refreshAppearance(root);
		expect(root.getAttribute("data-theme")).toBe("graphite");
		expect(root.style.getPropertyValue("--editor-text")).toBe("#111111");
	});

	it("resolves System through the operating system setting", () => {
		expect(resolveMode("system", true)).toBe("dark");
		expect(resolveMode("system", false)).toBe("light");
		expect(resolveMode("light", true)).toBe("light");
		expect(resolveMode("dark", false)).toBe("dark");
		vi.stubGlobal("matchMedia", () => ({ matches: true }));
		saveThemeChoice({ id: "default", mode: "system" });
		saveColors({ light: {}, dark: { italic: "#abcdef" } });
		refreshAppearance(document.documentElement);
		expect(
			document.documentElement.style.getPropertyValue("--editor-italic"),
		).toBe("#abcdef");
	});
});

it("formats and clamps channel values as #rrggbb", () => {
	expect(toHex(0, 0, 0)).toBe("#000000");
	expect(toHex(255, 128, 1)).toBe("#ff8001");
	expect(toHex(-5, 300, 15.6)).toBe("#00ff10");
});

describe("text sizes", () => {
	it("reads only sane saved sizes and leaves the rest to the theme", () => {
		const storage = {
			getItem: () =>
				JSON.stringify({
					"editor.size.body": 18,
					"editor.size.h1": 4,
					"editor.size.h2": "big",
					"editor.size.h3": 500,
				}),
		};
		expect(loadTextSizes(storage)).toEqual({
			body: 18,
			h1: null,
			h2: null,
			h3: 96,
			h4: null,
			h5: null,
			h6: null,
		});
	});

	it("sets a CSS variable per size and clears it for the theme's own", () => {
		const root = document.createElement("div");
		applyTextSizes(root, { ...loadTextSizes(), h4: 19, body: 15 });
		expect(root.style.getPropertyValue("--editor-h4-size")).toBe("19px");
		expect(root.style.getPropertyValue("--editor-font-size")).toBe("15px");
		applyTextSizes(root, loadTextSizes());
		expect(root.style.getPropertyValue("--editor-h4-size")).toBe("");
	});
});
