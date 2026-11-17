import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { loadLayout, saveLayout, sidebarShortcut } from "./shell-layout";

it("round-trips sizes including either or both collapsed sidebars", () => {
	let value: string | null = null;
	const storage = () => ({
		getItem: () => value,
		setItem: (_: string, next: string) => {
			value = next;
		},
	});
	expect(loadLayout(storage)).toBeUndefined();
	for (const layout of [
		{ left: 25, editor: 50, right: 25 },
		{ left: 0, editor: 75, right: 25 },
		{ left: 25, editor: 75, right: 0 },
		{ left: 0, editor: 100, right: 0 },
	]) {
		saveLayout(layout, storage);
		expect(loadLayout(storage)).toEqual(layout);
	}
	for (const invalid of [
		"broken",
		"null",
		"{}",
		'{"left":-1,"editor":101,"right":0}',
		'{"left":20,"editor":20,"right":20}',
		'{"left":"25","editor":50,"right":25}',
		'{"left":50,"editor":0,"right":50}',
	]) {
		value = invalid;
		expect(loadLayout(storage)).toBeUndefined();
	}
});

it("tolerates storage access, read and write failures", () => {
	const fail = () => {
		throw new Error("unavailable");
	};
	for (const storage of [fail, () => ({ getItem: fail, setItem: fail })]) {
		expect(loadLayout(storage)).toBeUndefined();
		expect(() =>
			saveLayout({ left: 0, editor: 100, right: 0 }, storage),
		).not.toThrow();
	}
});

it("matches only Command backslash shortcuts, including shifted key values", () => {
	const event = {
		key: "\\",
		code: "Backslash",
		metaKey: true,
		ctrlKey: false,
		altKey: false,
		shiftKey: false,
		isComposing: false,
		repeat: false,
	};
	expect(sidebarShortcut(event)).toBe("left");
	expect(sidebarShortcut({ ...event, shiftKey: true, key: "|" })).toBe("right");
	for (const change of [
		{ metaKey: false },
		{ ctrlKey: true },
		{ altKey: true },
		{ isComposing: true },
		{ repeat: true },
		{ key: "b", code: "KeyB" },
	]) {
		expect(sidebarShortcut({ ...event, ...change })).toBeNull();
	}
});

const css = (file: string) =>
	readFileSync(resolve(process.cwd(), file), "utf8");

/** The declarations of the first rule whose selector is exactly `selector`. */
function rule(source: string, selector: string): string {
	const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const found = new RegExp(
		`(?:^|\\}\\s*\\n|\\*/\\s*\\n)${escaped}\\s*\\{([^}]*)\\}`,
	).exec(source);
	if (!found) throw new Error(`no rule for ${selector}`);
	return found[1] as string;
}

// The panel's frame starts at the breadcrumb row; the tabs float above it.
it("puts the pane's frame below the tab strip, which has no frame of its own", () => {
	const pane = css("src/app/pane.css");
	const frame = rule(pane, ".pane-frame");
	expect(frame).toMatch(/border:[^;]*var\(--shell-border\)/);
	expect(frame).toMatch(/border-radius:\s*var\(--shell-radius\)/);
	expect(frame).toMatch(/background:\s*var\(--editor-bg\)/);

	const app = css("src/app/app.css");
	const strip = rule(app, ".tab-bar");
	expect(strip).toMatch(/background:\s*none/);
	expect(strip).toMatch(/margin-bottom:\s*var\(--space-1\)/);
	expect(strip).not.toMatch(/border-radius/);
	expect(strip).not.toMatch(/box-shadow/);

	// While panes show, the editor's panel carries no frame of its own.
	const panel = rule(
		app,
		'.shell-regions > [data-slot="resizable-panel"]:has(.editor-split)',
	);
	expect(panel).toMatch(/border-color:\s*transparent/);
	expect(panel).toMatch(/background:\s*none/);
	expect(panel).toMatch(/box-shadow:\s*none/);
});

it("gives every tab its own radius and a gap, and splits get a frame each", () => {
	const app = css("src/app/app.css");
	expect(rule(app, ".tab")).toMatch(/border-radius:\s*var\(--radius-control\)/);
	expect(rule(app, ".tab-list")).toMatch(/gap:\s*var\(--space-1\)/);
	expect(rule(app, ".tab-bar")).toMatch(/gap:\s*var\(--space-1\)/);
	const pane = css("src/app/pane.css");
	expect(pane).toMatch(
		/\.workspace-pane\[data-split="true"\]\[data-focused="true"\] \.pane-frame/,
	);
	expect(rule(pane, '.editor-split [data-slot="resizable-handle"]')).toMatch(
		/width:\s*var\(--shell-gap\)/,
	);
});

it("moves Refined's panel shadow onto the pane frame", () => {
	const refined = css("src/ui/themes/refined.css");
	expect(refined).toMatch(
		/& \.pane-frame\s*\{\s*box-shadow:\s*var\(--panel-shadow\)/,
	);
	expect(refined).toMatch(/:not\(:has\(\.editor-split\)\)/);
});
