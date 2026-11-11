import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";

const css = readFileSync(resolve(process.cwd(), "src/app/pane.css"), "utf8");

/** The declarations of the first rule whose selector is exactly `selector`. */
function rule(selector: string): string {
	const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const found = new RegExp(
		`(?:^|\\}\\s*\\n|\\*/\\s*\\n)${escaped}\\s*\\{([^}]*)\\}`,
	).exec(css);
	if (!found) throw new Error(`no rule for ${selector}`);
	return found[1] as string;
}

// Shapes were invisible in dark mode: no line round an ellipse or a diamond, and
// a rectangle's line was the faint divider color.
it("draws a line in the item's own color round every shape", () => {
	expect(rule(".canvas-shape-bg")).toMatch(
		/border:\s*var\(--border-width\) solid var\(--item-accent\)/,
	);
	// Clipped shapes cannot carry a border, so each has its line as a clipped
	// layer under a smaller clipped fill.
	for (const shape of ["ellipse", "diamond"]) {
		const outer = rule(`.canvas-shape[data-shape="${shape}"] .canvas-shape-bg`);
		expect(outer).toMatch(/clip-path/);
		const inner = rule(
			`.canvas-shape[data-shape="${shape}"] .canvas-shape-bg::after`,
		);
		expect(inner).toMatch(/clip-path/);
	}
	const lines = rule(
		'.canvas-shape[data-shape="ellipse"] .canvas-shape-bg,\n.canvas-shape[data-shape="diamond"] .canvas-shape-bg',
	);
	expect(lines).toMatch(/background:\s*var\(--item-accent\)/);
	const fills = rule(
		'.canvas-shape[data-shape="ellipse"] .canvas-shape-bg::after,\n.canvas-shape[data-shape="diamond"] .canvas-shape-bg::after',
	);
	expect(fills).toMatch(/background:\s*var\(--item-fill\)/);
});

it("takes the fill and the line from the item's color for stickies and shapes alike", () => {
	for (const tone of ["info", "tip", "warning", "danger"])
		expect(
			rule(
				`.canvas-item[data-tone="${tone}"],\n.canvas-card[data-tone="${tone}"],\n.tone-swatch[data-tone="${tone}"]`,
			),
		).toMatch(
			new RegExp(
				`--item-accent:\\s*var\\(--callout-${tone}-accent\\)[\\s\\S]*--item-fill:\\s*var\\(--callout-${tone}-bg\\)`,
			),
		);
	expect(rule(".canvas-sticky")).toMatch(/background:\s*var\(--item-fill\)/);
	expect(rule(".canvas-shape-bg")).toMatch(/background:\s*var\(--item-fill\)/);
});

it("gives a colored card a line and a fill in its color", () => {
	const card = rule(".canvas-card[data-tone]");
	expect(card).toMatch(
		/border:\s*var\(--border-width\) solid var\(--item-accent\)/,
	);
	expect(card).toMatch(/background:\s*var\(--item-fill\)/);
});

it("sizes the text of sticky notes, shapes and labels from the size attribute", () => {
	for (const type of ["label", "sticky", "shape"]) {
		expect(css).toContain(`.canvas-${type}[data-size="s"]`);
		expect(css).toContain(`.canvas-${type}[data-size="l"]`);
	}
	expect(
		rule(
			'.canvas-label[data-size="s"],\n.canvas-sticky[data-size="s"],\n.canvas-shape[data-size="s"]',
		),
	).toMatch(/font-size:\s*var\(--font-size-small\)/);
	expect(
		rule(
			'.canvas-label[data-size="l"],\n.canvas-sticky[data-size="l"],\n.canvas-shape[data-size="l"]',
		),
	).toMatch(/font-size:\s*var\(--editor-h2-size\)/);
});
