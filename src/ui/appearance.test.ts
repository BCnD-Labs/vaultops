// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { contrastRatio, hexToHsl } from "../components/ui/color-utils";
import {
	accentForBackground,
	accentNote,
	applyAccent,
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

describe("accent contrast", () => {
	const darkBg = "#111214";
	const lightBg = "#ffffff";
	const cases: [string, string][] = [
		["#232323", darkBg],
		["#2563eb", darkBg],
		["#2563eb", lightBg],
		["#f5f5f5", lightBg],
		["#ffff00", lightBg],
		["#000000", darkBg],
		["#808080", lightBg],
	];

	it("lightens a too-dark accent on a dark background and keeps its hue", () => {
		const result = accentForBackground("#2a3a5a", darkBg);
		expect(result.adjusted).toBe(true);
		expect(contrastRatio(result.primary, darkBg)).toBeGreaterThanOrEqual(3);
		expect(
			Math.abs(hexToHsl(result.primary).h - hexToHsl("#2a3a5a").h),
		).toBeLessThan(3);
		const grey = accentForBackground("#232323", darkBg);
		expect(grey.adjusted).toBe(true);
		expect(contrastRatio(grey.primary, darkBg)).toBeGreaterThanOrEqual(3);
		expect(hexToHsl(grey.primary).l).toBeGreaterThan(hexToHsl("#232323").l);
	});

	it("leaves a mid blue alone in both modes", () => {
		for (const bg of [darkBg, lightBg])
			expect(accentForBackground("#2563eb", bg)).toMatchObject({
				primary: "#2563eb",
				adjusted: false,
			});
	});

	it("darkens a very light accent on a light background", () => {
		const result = accentForBackground("#f5f5f5", lightBg);
		expect(result.adjusted).toBe(true);
		expect(contrastRatio(result.primary, lightBg)).toBeGreaterThanOrEqual(3);
		expect(hexToHsl(result.primary).l).toBeLessThan(hexToHsl("#f5f5f5").l);
	});

	it.each(cases)("keeps text on %s readable over %s", (accent, bg) => {
		const { primary, primaryForeground } = accentForBackground(accent, bg);
		expect(contrastRatio(primary, bg)).toBeGreaterThanOrEqual(3);
		expect(contrastRatio(primary, primaryForeground)).toBeGreaterThanOrEqual(
			4.5,
		);
	});

	it("sets nothing without an accent and clears earlier values", () => {
		const root = document.documentElement;
		applyAccent(root, null, darkBg);
		for (const name of ["--primary", "--primary-foreground", "--ring"])
			expect(root.style.getPropertyValue(name)).toBe("");
		applyAccent(root, "#2563eb", darkBg);
		applyAccent(root, null, darkBg);
		expect(root.style.getPropertyValue("--primary")).toBe("");
	});

	it("applies the adjusted shade in dark mode and the pick where it passes", () => {
		const root = document.documentElement;
		applyAccent(root, "#232323", darkBg);
		const dark = root.style.getPropertyValue("--primary");
		expect(dark).not.toBe("#232323");
		expect(root.style.getPropertyValue("--ring")).toBe(dark);
		expect(root.style.getPropertyValue("--primary-foreground")).not.toBe("");
		applyAccent(root, "#232323", lightBg);
		expect(root.style.getPropertyValue("--primary")).toBe("#232323");
	});

	it("re-runs when the mode changes", () => {
		const root = document.documentElement;
		localStorage.setItem(
			"vaultops.settings",
			JSON.stringify({ "appearance.accent": "#232323" }),
		);
		root.style.setProperty("--background", lightBg);
		refreshAppearance(root);
		expect(root.style.getPropertyValue("--primary")).toBe("#232323");
		root.style.setProperty("--background", darkBg);
		refreshAppearance(root);
		expect(root.style.getPropertyValue("--primary")).not.toBe("#232323");
	});

	it("words a note only when the accent was adjusted", () => {
		expect(accentNote("#232323", "dark", darkBg)).toMatch(/dark mode/);
		expect(accentNote("#f5f5f5", "light", lightBg)).toMatch(/light mode/);
		expect(accentNote("#2563eb", "dark", darkBg)).toBeNull();
		expect(accentNote(null, "dark", darkBg)).toBeNull();
	});
});
