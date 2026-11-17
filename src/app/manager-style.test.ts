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

// One window for both managers, in one place.
it("sizes both managers from the shared .manager-dialog rule only", () => {
	const resources = read("src/app/resources.css");
	const templates = read("src/app/templates.css");
	expect(read("src/app/manager.css")).toMatch(
		/\.manager-dialog\.manager-dialog\s*\{[^}]*width:/,
	);
	for (const css of [resources, templates]) {
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
