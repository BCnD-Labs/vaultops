import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { themes } from "./themes";

function files(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
		entry.isDirectory()
			? files(join(dir, entry.name))
			: [join(dir, entry.name)],
	);
}
it("keeps look literals in theme files", () => {
	const violations: string[] = [];
	for (const file of files("src").filter(
		(file) => /\.(css|tsx)$/.test(file) && !file.startsWith("src/ui/themes/"),
	)) {
		const source = readFileSync(file, "utf8");
		// Font-face declarations identify bundled assets, not a component font choice.
		const checked = source.replace(/@font-face\s*\{[^}]*\}/g, "");
		const forbidden =
			/#[\da-f]{3,8}\b|\b(?:rgba?|hsla?)\s*\(|(?:font-size|border-radius|box-shadow|font-family)\s*:\s*(?!var\(|inherit|none)[^;{}]*\d+(?:px|rem|em|%)|(?:fontSize|borderRadius|boxShadow)\s*:\s*(?:\d|["'][^"']*\d+(?:px|rem|em))|(?:font-family)\s*:\s*(?!var\(|inherit)["'a-zA-Z]|(?:rounded|text|shadow)-\[\d+(?:px|rem)/gi;
		if (forbidden.test(checked)) violations.push(file);
	}
	expect(violations).toEqual([]);
});

const defaultTokens = [
	...readFileSync("src/ui/themes/default.css", "utf8").matchAll(/--([\w-]+):/g),
].map((match) => match[1]);
it.each(themes)("checks $id tokens and contrast", (theme) => {
	const css = readFileSync(`src/ui/themes/${theme.id}.css`, "utf8");
	const blocks = [...css.matchAll(/\{([^{}]*)\}/g)].map((match) =>
		Object.fromEntries(
			[...(match[1] ?? "").matchAll(/--([\w-]+):\s*([^;]+);/g)].map((entry) => [
				entry[1],
				(entry[2] ?? "").trim(),
			]),
		),
	);
	expect(Object.keys(blocks[0] ?? {}).sort()).toEqual(
		[...new Set(defaultTokens)].sort(),
	);
	expect(readFileSync("src/ui/theme.css", "utf8")).toContain(
		`@import "./themes/${theme.id}.css"`,
	);
	function luminance(hex: string) {
		const channels = hex
			.slice(1)
			.match(/../g)
			?.map((part) => {
				const c = Number.parseInt(part, 16) / 255;
				return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
			});
		if (channels?.length !== 3)
			throw new Error(`Not an opaque RGB color: ${hex}`);
		return (
			(channels[0] ?? 0) * 0.2126 +
			(channels[1] ?? 0) * 0.7152 +
			(channels[2] ?? 0) * 0.0722
		);
	}
	for (const dark of [false, true]) {
		const tokens = { ...blocks[0], ...(dark ? blocks[2] : {}) };
		const resolve = (key: string): string =>
			tokens[key].startsWith("var(")
				? resolve(tokens[key].slice(6, -1))
				: tokens[key];
		for (const [fg, bg] of [
			["foreground", "background"],
			["muted-foreground", "background"],
			["foreground", "surface-container-high"],
			["muted-foreground", "surface-container-high"],
			["primary-foreground", "primary"],
			["on-primary-container", "primary-container"],
		] as const) {
			const values = [luminance(resolve(fg)), luminance(resolve(bg))];
			expect(
				(Math.max(...values) + 0.05) / (Math.min(...values) + 0.05),
				`${theme.id} ${dark ? "dark" : "light"} ${fg}/${bg}`,
			).toBeGreaterThanOrEqual(theme.id === "high-contrast" ? 7 : 4.5);
		}
	}
	if (theme.id === "high-contrast") {
		expect(blocks[0]?.["focus-ring-width"]).toBe("2px");
		expect(blocks[0]?.["border-width"]).toBe("2px");
	}
	expect(css).toContain('[data-mode="system"]');
	expect(css).toContain("prefers-color-scheme: dark");
	expect(blocks[3]).toEqual(blocks[2]);
});
