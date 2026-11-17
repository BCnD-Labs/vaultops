import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";

const read = (file: string) =>
	readFileSync(resolve(process.cwd(), file), "utf8");

/** Every `selector { declarations }` pair, comments left out. */
function rules(css: string): { selector: string; body: string }[] {
	return [
		...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g),
	].map((m) => ({ selector: (m[1] ?? "").trim(), body: m[2] ?? "" }));
}

const refined = rules(read("src/ui/themes/refined.css"));

/** Does any selector of the rule name `part`, as a whole class or attribute? */
const names = (selector: string, part: string) =>
	selector
		.split(",")
		.some((s) =>
			new RegExp(`${part.replace(/[[\]().]/g, "\\$&")}(?![\\w-])`).test(s),
		);

// Buttons, toggles and selected rows are flat in Refined: no raised shadow,
// raised edge ring or raised fill. Raising is for panels and cards only.
const flat = [
	'[data-slot="button"]',
	".shell-toggle",
	".vault-switch",
	".sidebar-foot-settings",
	".res-row",
	".tpl-row",
	".note-list button",
	'[data-slot="tabs-trigger"]',
	".plan-checkin-slot",
];

it("never applies the raised look to buttons or selected rows in Refined", () => {
	const bad = refined
		.filter((r) => flat.some((f) => names(r.selector, f)))
		.filter((r) =>
			/raise-shadow|raise-edge|raised-control|box-shadow/.test(r.body),
		)
		// The coloured "done" ring on a check-in slot is state, not elevation.
		.filter((r) => !r.selector.includes("[data-done]"))
		.map((r) => r.selector);
	expect(bad).toEqual([]);
});

it("shows every selected row and segment in Refined as the one soft tint", () => {
	const selected = refined.filter(
		(r) =>
			r.selector.endsWith('.note-list button[aria-current="true"]') ||
			r.selector.includes('[data-state="active"][data-slot="tabs-trigger"]') ||
			r.selector.includes(".plan-checkin-slot[data-current]"),
	);
	expect(selected.length).toBeGreaterThanOrEqual(3);
	for (const r of selected)
		expect(r.body).toContain("background: var(--row-raised)");
});

// Shadows stay on the floating things.
it("keeps elevation shadows for menus, popovers and dialogs", () => {
	const css = read("src/ui/themes/refined.css");
	expect(css).toMatch(/--elevation-2:/);
	expect(css).toMatch(/--elevation-3:/);
	const shadowed: [string, string][] = [
		["src/components/ui/dropdown-menu.tsx", "shadow-md"],
		["src/components/ui/popover.tsx", "shadow-md"],
		["src/components/ui/dialog.tsx", "shadow-lg"],
	];
	for (const [file, shadow] of shadowed) expect(read(file)).toContain(shadow);
	const theme = read("src/ui/theme.css");
	expect(theme).toContain("--shadow-md: var(--elevation-2)");
	expect(theme).toContain("--shadow-lg: var(--elevation-3)");
});

// Hand-made buttons in the managers and planner are ghost: no border or shadow.
it("keeps the hand-made manager buttons borderless", () => {
	const css = rules(
		read("src/app/resources.css") + read("src/app/templates.css"),
	);
	for (const name of [
		".res-pick-tile",
		".res-pick-add",
		".tpl-more",
		".res-mention",
	]) {
		for (const r of css.filter((x) => x.selector === name)) {
			expect(r.body, name).not.toMatch(/border:\s*var|border-style|box-shadow/);
		}
	}
});
