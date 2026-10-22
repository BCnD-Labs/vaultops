import { describe, expect, it } from "vitest";
import { checkVaultPath } from "../vault-path/vault-path";
import { fileNameFor, NOTE_EXT, safeName } from "./file-name";

const bytes = (s: string) => new TextEncoder().encode(s).length;
const chars = (s: string) =>
	[...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(s)]
		.length;

describe("fileNameFor", () => {
	it.each([
		["a/b", "a-b.vnote"],
		["a:b", "a-b.vnote"],
		["tab\there", "tab-here.vnote"],
		[".hidden", "hidden.vnote"],
		["...dots...", "dots.vnote"],
		["   ", "Untitled.vnote"],
		["", "Untitled.vnote"],
		["  My Note  ", "My Note.vnote"],
		["Ideas 😀", "Ideas 😀.vnote"],
		["a\\b", "a-b.vnote"],
	])("%j becomes %j", (title, expected) => {
		expect(fileNameFor(title, [])).toBe(expected);
	});

	it("cuts a 500-character title to 120 characters", () => {
		const name = fileNameFor("x".repeat(500), []);
		expect(name).toBe(`${"x".repeat(120)}${NOTE_EXT}`);
	});

	it("cuts a 500-emoji title without splitting an emoji, under 255 bytes", () => {
		const family = "👨‍👩‍👧‍👦"; // one character on screen, 25 bytes
		const name = fileNameFor(family.repeat(500), []);
		const stem = name.slice(0, -NOTE_EXT.length);
		expect(stem.length % family.length).toBe(0);
		expect(bytes(`${stem} 99${NOTE_EXT}`)).toBeLessThanOrEqual(255);
		expect(chars(stem)).toBeGreaterThan(0);
	});

	it("adds 2, 3 for clashes, ignoring capital letters", () => {
		expect(fileNameFor("Note", ["note.vnote"])).toBe("Note 2.vnote");
		expect(fileNameFor("Note", ["NOTE.VNOTE", "Note 2.vnote"])).toBe(
			"Note 3.vnote",
		);
	});

	it("treats é typed two ways as a clash", () => {
		expect(fileNameFor("café", ["café.vnote"])).toBe("café 2.vnote");
	});

	it("keeps clash suffixes under the byte limit for long names", () => {
		const taken = [fileNameFor("é".repeat(500), [])];
		const second = fileNameFor("é".repeat(500), taken);
		expect(second.endsWith(` 2${NOTE_EXT}`)).toBe(true);
		expect(bytes(second)).toBeLessThanOrEqual(255);
	});

	it("never starts with a dot and never names the app folder", () => {
		for (const title of [
			".vaultops",
			"..vaultops",
			" .vaultops",
			".git",
			".",
			"..",
		]) {
			const name = safeName(title);
			expect(name.startsWith(".")).toBe(false);
			expect(name).not.toBe(".vaultops");
		}
	});

	it("always passes the vault path checker", () => {
		const titles = [
			"a/b",
			"a:b",
			".hidden",
			"",
			"x".repeat(500),
			"👍".repeat(500),
			"\u0000\u0007x",
			"a\\b",
			"..",
			"Ünïcödé",
		];
		for (const title of titles) {
			expect(checkVaultPath(fileNameFor(title, [])).ok).toBe(true);
		}
	});

	it("safeName without an extension is usable for folders", () => {
		expect(safeName("Projects/2026")).toBe("Projects-2026");
		expect(safeName(".git")).toBe("git");
	});
});
