// @vitest-environment happy-dom

import {
	cleanup,
	createEvent,
	fireEvent,
	render,
	waitFor,
} from "@testing-library/react";
import type { JSONContent } from "@tiptap/core";
import { afterEach, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { NoteEditor } from "./NoteEditor";

afterEach(cleanup);

const p = (id: string, text: string): JSONContent => ({
	type: "paragraph",
	attrs: { id },
	content: [{ type: "text", text }],
});
const h = (id: string, level: number, text: string): JSONContent => ({
	type: "heading",
	attrs: { id, level },
	content: [{ type: "text", text }],
});
const li = (id: string, text: string, nested?: JSONContent): JSONContent => ({
	type: "listItem",
	attrs: { id },
	content: [p(`${id}p`, text), ...(nested ? [nested] : [])],
});
const list = (id: string, items: JSONContent[]): JSONContent => ({
	type: "bulletList",
	attrs: { id },
	content: items,
});

function show(content: JSONContent[], onChange = vi.fn()) {
	render(
		<TooltipProvider>
			<NoteEditor
				doc={{ type: "doc", content }}
				noteId="n"
				onChange={onChange}
			/>
		</TooltipProvider>,
	);
	return onChange;
}

function press(button: Element) {
	const event = createEvent.mouseDown(button);
	fireEvent(button, event);
}

it("folds a heading's section up to the next heading of the same level and back", async () => {
	const onChange = show([
		h("h1", 1, "One"),
		p("a", "under one"),
		h("h2", 2, "Sub"),
		p("b", "under sub"),
		h("h3", 1, "Two"),
		p("c", "under two"),
	]);
	await waitFor(() =>
		expect(document.querySelectorAll(".fold-toggle").length).toBe(3),
	);
	press(document.querySelector("h1 .fold-toggle") as Element);
	await waitFor(() =>
		expect(document.querySelectorAll(".fold-hidden").length).toBe(3),
	);
	const hidden = [...document.querySelectorAll(".fold-hidden")].map(
		(n) => n.textContent,
	);
	expect(hidden).toEqual(["under one", "Sub", "under sub"]);
	expect(document.querySelector("h1.is-folded")).not.toBeNull();
	// Folding is only a view: the note did not change.
	expect(onChange).not.toHaveBeenCalled();
	press(document.querySelector("h1 .fold-toggle") as Element);
	await waitFor(() =>
		expect(document.querySelectorAll(".fold-hidden").length).toBe(0),
	);
});

it("folds the nested part of a list item and leaves items without children alone", async () => {
	show([
		list("l", [
			li("i1", "parent", list("l2", [li("i2", "child")])),
			li("i3", "plain"),
		]),
	]);
	await waitFor(() =>
		expect(document.querySelectorAll(".fold-toggle").length).toBe(1),
	);
	press(document.querySelector("li .fold-toggle") as Element);
	await waitFor(() =>
		expect(document.querySelectorAll(".fold-hidden").length).toBe(1),
	);
	expect(document.querySelector(".fold-hidden")?.tagName).toBe("UL");
	expect(document.querySelector("li.is-folded")).not.toBeNull();
});
