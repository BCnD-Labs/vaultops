import { describe, expect, it, vi } from "vitest";
import { applyTheme, loadThemeChoice, saveThemeChoice, themes } from "./index";

describe("theme choice", () => {
	it("registers both modes and applies each mode, including live CSS system mode", () => {
		expect(themes[0].modes).toEqual(["light", "dark"]);
		for (const mode of ["light", "dark", "system"] as const) {
			const setAttribute = vi.fn();
			applyTheme({ setAttribute }, { id: "default", mode });
			expect(setAttribute.mock.calls).toEqual([
				["data-theme", "default"],
				["data-mode", mode],
			]);
		}
	});
	it("round trips choices and rejects invalid or corrupt stored values", () => {
		let value = "";
		const storage = {
			getItem: () => value,
			setItem: (_key: string, next: string) => {
				value = next;
			},
		};
		saveThemeChoice({ id: "default", mode: "dark" }, storage);
		expect(loadThemeChoice(storage)).toEqual({ id: "default", mode: "dark" });
		for (const bad of [
			"oops",
			"null",
			'{"id":"unknown","mode":"dark"}',
			'{"id":"default","mode":"invalid"}',
		]) {
			value = bad;
			expect(loadThemeChoice(storage)).toEqual({
				id: "default",
				mode: "system",
			});
		}
	});
	it("survives throwing storage access and methods", () => {
		const fail = () => {
			throw new Error("disabled");
		};
		expect(loadThemeChoice({ getItem: fail }).mode).toBe("system");
		expect(() =>
			saveThemeChoice({ id: "default", mode: "light" }, { setItem: fail }),
		).not.toThrow();
		vi.stubGlobal("localStorage", undefined);
		expect(loadThemeChoice().mode).toBe("system");
		expect(() =>
			saveThemeChoice({ id: "default", mode: "light" }),
		).not.toThrow();
		vi.unstubAllGlobals();
	});
});
