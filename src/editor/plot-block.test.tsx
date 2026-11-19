// @vitest-environment happy-dom

import {
	act,
	cleanup,
	fireEvent,
	render,
	waitFor,
} from "@testing-library/react";
import { type Editor, EditorContent, useEditor } from "@tiptap/react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { isEnabled } from "../core/features/registry";
import { docToBlocks } from "./doc-blocks";
import { createExtensions } from "./extensions";
import { PLOT_PLACEHOLDER } from "./plot-block";
import { filterSlashItems, SLASH_ITEMS } from "./slash-items";

let current: Editor | null = null;

function Harness({ editable = true }: { editable?: boolean }) {
	const editor = useEditor({
		extensions: createExtensions(),
		editable,
		content: {
			type: "doc",
			content: [
				{ type: "plotBlock", attrs: { id: "g" } },
				{ type: "paragraph", attrs: { id: "p" } },
			],
		},
	});
	current = editor;
	return <EditorContent editor={editor} />;
}

const formulas = () =>
	document.querySelector("textarea") as HTMLTextAreaElement;
const curves = () => document.querySelectorAll("path.plot-curve");
const attrs = () =>
	docToBlocks((current as Editor).getJSON())[0]?.attrs as
		| Record<string, unknown>
		| undefined;

beforeEach(() => {
	current = null;
});
afterEach(cleanup);

it("is in the slash menu as Function plot, behind the plots feature", () => {
	const item = SLASH_ITEMS.find((i) => i.id === "plot");
	expect(item).toMatchObject({ section: "Visual", feature: "plots" });
	expect(filterSlashItems("graph").map((i) => i.id)).toContain("plot");
	expect(
		filterSlashItems("graph", {
			columns: true,
			enabled: (id) => id !== "plots",
		}),
	).not.toContain(item);
	expect(isEnabled("plots", {})).toBe(true);
});

it("draws y = x^2 for a new block and saves nothing for it", async () => {
	render(<Harness />);
	await waitFor(() => expect(curves()).toHaveLength(1));
	expect(formulas().value).toBe("y = x^2");
	expect(attrs()).toBeUndefined();
});

it("saves the formula and range, and draws one curve per formula", async () => {
	render(<Harness />);
	await waitFor(() => expect(formulas()).toBeTruthy());
	fireEvent.change(formulas(), { target: { value: "sin(x); cos(x)" } });
	await waitFor(() => expect(curves()).toHaveLength(2));
	expect(attrs()).toEqual({ expr: "sin(x); cos(x)" });
	const from = document.querySelector(
		'input[aria-label="x from"]',
	) as HTMLInputElement;
	fireEvent.change(from, { target: { value: "-3" } });
	fireEvent.blur(from);
	await waitFor(() => expect(attrs()).toMatchObject({ xmin: -3 }));
});

it("explains a typo and keeps the last good graph", async () => {
	render(<Harness />);
	await waitFor(() => expect(curves()).toHaveLength(1));
	fireEvent.change(formulas(), { target: { value: "foo(x)" } });
	await waitFor(() =>
		expect(document.querySelector(".plot-error")?.textContent).toBe(
			"I don't know 'foo'",
		),
	);
	expect(curves()).toHaveLength(1);
	fireEvent.change(formulas(), { target: { value: "x" } });
	await waitFor(() => expect(document.querySelector(".plot-error")).toBeNull());
});

it("resets a backwards range to the default", async () => {
	render(<Harness />);
	await waitFor(() => expect(formulas()).toBeTruthy());
	const to = document.querySelector(
		'input[aria-label="to"]',
	) as HTMLInputElement;
	fireEvent.change(to, { target: { value: "-20" } });
	fireEvent.blur(to);
	await waitFor(() => expect(to.value).toBe("10"));
	expect(attrs()).toBeUndefined();
});

it("shows a hint for blank text, and only the graph when read-only", async () => {
	render(<Harness />);
	await waitFor(() => expect(formulas()).toBeTruthy());
	fireEvent.change(formulas(), { target: { value: "" } });
	await waitFor(() =>
		expect(document.querySelector(".plot-empty")?.textContent).toBe(
			PLOT_PLACEHOLDER,
		),
	);
	cleanup();
	render(<Harness editable={false} />);
	await waitFor(() => expect(curves()).toHaveLength(1));
	expect(document.querySelector("textarea")).toBeNull();
	await act(async () => {});
});
