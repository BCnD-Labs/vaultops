import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";

function reducedMotionRules(file: string): Map<string, string> {
	const css = readFileSync(resolve(process.cwd(), file), "utf8");
	const start = css.indexOf("@media (prefers-reduced-motion: reduce)");
	if (start < 0) return new Map();
	const open = css.indexOf("{", start);
	let depth = 1;
	let end = open + 1;
	while (depth > 0 && end < css.length) {
		if (css[end] === "{") depth++;
		if (css[end] === "}") depth--;
		end++;
	}
	const body = css.slice(open + 1, end - 1);
	const rules = new Map<string, string>();
	for (const match of body.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
		for (const selector of (match[1] ?? "").split(",")) {
			rules.set(selector.trim(), match[2] ?? "");
		}
	}
	return rules;
}

it("removes transitions on controls and decorative parts under reduced motion", () => {
	const cases = {
		"src/app/app.css": ['[data-slot="button"]::after'],
		"src/app/pane.css": [".props-block-header svg"],
		"src/editor/editor.css": [
			".note-editor .quote-color-handle",
			".lift-ghost",
			".note-editor .table-edge-bar",
			".note-editor .fold-toggle::before",
			".note-editor pre .code-wrap",
			".note-editor pre .code-copy",
		],
	};
	for (const [file, selectors] of Object.entries(cases)) {
		const rules = reducedMotionRules(file);
		for (const selector of selectors) {
			expect(rules.get(selector) ?? "", `${file}: ${selector}`).toMatch(
				/transition:\s*none\s*;/,
			);
		}
	}
});
