import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";

const read = (file: string) =>
	readFileSync(resolve(process.cwd(), file), "utf8");

/** Every `selector { declarations }` pair, leaving out the template picker's rules. */
function rules(css: string): { selector: string; body: string }[] {
	return [
		...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g),
	]
		.map((m) => ({ selector: (m[1] ?? "").trim(), body: m[2] ?? "" }))
		.filter((r) => !r.selector.includes(".template-picker"));
}

// The managers use the app's spacing tokens, so the density follows the theme.
it.each([
	"src/app/resources.css",
	"src/app/templates.css",
	"src/app/manager.css",
])("keeps raw px out of padding, gap and margin in %s", (file) => {
	const bad = rules(read(file)).flatMap((r) =>
		[...r.body.matchAll(/(?:padding|gap|margin)[\w-]*\s*:\s*([^;]+);/g)]
			.filter((d) => /\d+px/.test(d[1] ?? ""))
			.map((d) => `${r.selector} { ${d[0]} }`),
	);
	expect(bad).toEqual([]);
});

// The managers live in a resizable window, so their narrow layouts follow the
// window's size (the .manager-content container), never the app's viewport.
it("stacks the managers by the window's width, not the viewport's", () => {
	expect(read("src/app/manager.css")).toMatch(
		/\.manager-content\s*\{[^}]*container:\s*manager\s*\/\s*size;/,
	);
	for (const file of ["src/app/resources.css", "src/app/templates.css"]) {
		const css = read(file);
		expect(css).toMatch(/@container manager \(max-width: 30rem\)/);
		expect(css).not.toMatch(/@media[^{]*width/);
		expect(css).not.toMatch(/\.(?:res|tpl)-manager\b/);
	}
});

// Hover and selected rows read like the note tree's.
it("uses the tree's hover and selected colours in both managers", () => {
	const resources = read("src/app/resources.css");
	expect(resources).toMatch(
		/\.res-row:hover:not\(:disabled\)\s*\{[^}]*var\(--accent\)/,
	);
	expect(resources).toMatch(
		/\.res-row\[aria-current="true"\]\s*\{[^}]*var\(--row-raised\)/,
	);
	expect(read("src/app/templates.css")).toMatch(
		/\.tpl-row\[data-selected="true"\]\s*\{[^}]*var\(--row-raised\)/,
	);
});
