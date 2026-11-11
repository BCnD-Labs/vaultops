import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";

const read = (file: string) =>
	readFileSync(resolve(process.cwd(), file), "utf8");

/** The declarations of the first rule whose selector is exactly `selector`. */
function rule(css: string, selector: string): string {
	const found = new RegExp(
		`(?:^|\\}\\s*\\n|\\*/\\s*\\n)${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`,
	).exec(css);
	if (!found) throw new Error(`no rule for ${selector}`);
	return found[1] as string;
}

// The sidebars' top rows read as part of the panel: even gaps, no rule under them.
it("gives both sidebar header rows even spacing and no rule underneath", () => {
	const header = rule(read("src/app/sidebar.css"), ".sidebar-header");
	expect(header).toMatch(/gap:\s*var\(--space-1\)/);
	expect(header).not.toMatch(/border-bottom/);
});

// The stacked planner's section header already says "Tasks".
it("hides the task card's own title inside the stacked planner", () => {
	const css = read("src/app/planner/planner.css");
	expect(rule(css, ".planner-stack .plan-card-head h2")).toMatch(
		/display:\s*none/,
	);
});

// The vault menu lives in the bottom row now, beside settings, and its name
// takes the row's spare width instead of being squeezed.
it("puts the vault menu in a bottom row that gives the name the spare width", () => {
	const css = read("src/app/sidebar.css");
	expect(rule(css, ".sidebar-foot")).toMatch(/display:\s*flex/);
	expect(rule(css, ".vault-switch")).toMatch(/flex:\s*1/);
	expect(rule(css, ".vault-switch-name")).toMatch(/text-overflow:\s*ellipsis/);
});

// Tabs float like Safari's: rounded pills with gaps, the active one raised, and
// no curved shoulders joining it to the page.
it("draws the tabs as floating rounded pills with a gap, the active one raised", () => {
	const css = read("src/app/app.css");
	const bar = rule(css, ".tab-bar");
	expect(bar).toMatch(/gap:\s*var\(--space-1\)/);
	expect(bar).toMatch(/border-bottom:[^;]*transparent/);
	expect(rule(css, ".tab-list")).toMatch(/gap:\s*var\(--space-1\)/);
	expect(rule(css, ".tab")).toMatch(/border-radius:\s*var\(--radius-control\)/);
	expect(rule(css, '.tab[data-active="true"]')).toMatch(
		/background:\s*var\(--row-raised\)/,
	);
	expect(css).not.toMatch(/tab-shoulder/);
});

// The left panel's contents follow its rounded corners.
it("clips the left sidebar to the panel's rounded corners", () => {
	const side = rule(read("src/app/app.css"), ".shell-side");
	expect(side).toMatch(/border-radius:\s*inherit/);
	expect(side).toMatch(/overflow:\s*hidden/);
});

// The editor window's top corners went square when the tab strip was reworked.
it("clips the editor window to the panel's rounded corners", () => {
	const editor = rule(read("src/app/app.css"), ".shell-editor");
	expect(editor).toMatch(/border-radius:\s*inherit/);
	expect(editor).toMatch(/overflow:\s*hidden/);
});

// The canvas takes the whole pane; its name is a small label on top of it.
it("draws the canvas name as a small label on the canvas, not a full-width bar", () => {
	const css = read("src/app/pane.css");
	expect(rule(css, ".canvas-bar")).toMatch(/height:\s*0/);
	const name = rule(css, ".canvas-name");
	expect(name).toMatch(/position:\s*absolute/);
	expect(name).toMatch(/width:\s*min\(240px/);
	expect(css).not.toMatch(/\.canvas-bar\s*\{[^}]*border-bottom/);
});

// "Light" themes were pure white at the top of the scale.
it.each(["default", "graphite"])("keeps %s light mode off pure white", (id) => {
	const css = read(`src/ui/themes/${id}.css`);
	const first = /--neutral-0:\s*(#[0-9a-f]{6});/i.exec(css)?.[1];
	expect(first?.toLowerCase()).not.toBe("#ffffff");
});

// A fresh canvas opened "VERY close": fit-to-view never zooms in past 100%,
// and leaves a roomy margin.
it("opens a canvas at no more than 100% zoom, with a roomy margin", () => {
	const source = read("src/components/ui/canvas.tsx");
	expect(source).toMatch(
		/fitViewOptions=\{\{\s*padding:\s*0\.35,\s*maxZoom:\s*1\s*\}\}/,
	);
	expect(source).toMatch(/fitView\(\{[^}]*maxZoom:\s*1/);
});
