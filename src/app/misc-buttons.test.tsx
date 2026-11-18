// @vitest-environment happy-dom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { SaveStatus } from "../editor/SaveStatus";
import { StylePopover, Swatches } from "./StylePopover";

afterEach(cleanup);

const read = (file: string) =>
	readFileSync(resolve(process.cwd(), file), "utf8");

/** Every `selector { declarations }` pair, comments left out. */
function rules(css: string): { selector: string; body: string }[] {
	return [
		...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g),
	].map((m) => ({ selector: (m[1] ?? "").trim(), body: m[2] ?? "" }));
}

it("SaveStatus actions are Button components", () => {
	const failed = {
		kind: "failed",
		reason: "x",
		conflict: false,
	} as never;
	render(<SaveStatus state={failed} onRetry={() => {}} />);
	const retry = screen.getByRole("button", { name: "Retry" });
	expect(retry.getAttribute("data-slot")).toBe("button");
});

it("SaveStatus conflict choices are Button components", () => {
	const conflict = { kind: "failed", reason: "x", conflict: true } as never;
	render(
		<SaveStatus
			state={conflict}
			onRetry={() => {}}
			onLoadDisk={() => {}}
			onSaveCopy={() => {}}
		/>,
	);
	for (const name of [
		"Load the disk version",
		"Save mine as a copy",
		"Keep editing",
	]) {
		expect(screen.getByRole("button", { name }).getAttribute("data-slot")).toBe(
			"button",
		);
	}
	fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
	expect(
		screen.getByRole("button", { name: "Resolve" }).getAttribute("data-slot"),
	).toBe("button");
});

it("the style popover trigger is a Button", () => {
	render(<StylePopover name="Inbox" style={undefined} onChange={() => {}} />);
	expect(
		screen
			.getByRole("button", { name: "Style Inbox" })
			.getAttribute("data-slot"),
	).toBe("button");
});

it("swatches mark the chosen colour as pressed", () => {
	render(<Swatches value="blue" onPick={() => {}} />);
	expect(
		screen
			.getByRole("button", { name: "Colour blue" })
			.getAttribute("aria-pressed"),
	).toBe("true");
	expect(
		screen
			.getByRole("button", { name: "No colour" })
			.getAttribute("aria-pressed"),
	).toBe("false");
});

it("a pressed swatch gets a primary-token edge, in both style sheets", () => {
	for (const file of ["src/app/sidebar.css", "src/editor/editor.css"]) {
		const rule = rules(read(file)).find(
			(r) => r.selector === '.style-swatch[aria-pressed="true"]',
		);
		expect(rule?.body, file).toContain("var(--primary)");
		expect(rule?.body, file).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(/i);
	}
});

it("the format bar no longer paints pressed buttons itself", () => {
	const css = read("src/editor/editor.css");
	const custom = rules(css).filter(
		(r) =>
			r.selector.includes(".format-bar") &&
			r.selector.includes("aria-pressed") &&
			/background|color/.test(r.body),
	);
	expect(custom).toEqual([]);
});

it("the block drag handle keeps no colour or shadow override", () => {
	const custom = rules(read("src/editor/editor.css")).filter(
		(r) =>
			r.selector.includes(".block-drag-handle") &&
			/background|color|box-shadow/.test(r.body),
	);
	expect(custom).toEqual([]);
});
