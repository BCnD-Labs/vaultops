// @vitest-environment happy-dom

import {
	act,
	cleanup,
	fireEvent,
	render,
	waitFor,
} from "@testing-library/react";
import { type Editor, EditorContent, useEditor } from "@tiptap/react";
import { afterEach, expect, it } from "vitest";
import { docToBlocks } from "./doc-blocks";
import { createExtensions } from "./extensions";
import { SLASH_ITEMS } from "./slash-items";

let current: Editor | null = null;

function Harness({ content }: { content: object }) {
	const editor = useEditor({ extensions: createExtensions(), content });
	current = editor;
	return <EditorContent editor={editor} />;
}

function open(content: object): Editor {
	render(<Harness content={content} />);
	if (!current) throw new Error("editor did not start");
	return current;
}

/** Send a key through the editor's own key handlers, as a user's keypress would. */
function press(editor: Editor, key: string): boolean {
	const event = new KeyboardEvent("keydown", { key, cancelable: true });
	return !!editor.view.someProp("handleKeyDown", (f) => f(editor.view, event));
}

const para = (id: string, text?: string) => ({
	type: "paragraph",
	attrs: { id },
	...(text ? { content: [{ type: "text", text }] } : {}),
});
const toggle = (id: string, isOpen: boolean, ...children: object[]) => ({
	type: "toggle",
	attrs: { id, open: isOpen },
	content: children,
});
const types = (editor: Editor) =>
	(editor.getJSON().content ?? []).map((node) => node.type);
const toggleAttrs = (editor: Editor) => editor.getJSON().content?.[0]?.attrs;

afterEach(() => {
	cleanup();
	current = null;
});

it("turns the current line into the summary of an open toggle from the slash menu", () => {
	const editor = open({ type: "doc", content: [para("a", "/toggle")] });
	const item = SLASH_ITEMS.find((i) => i.id === "toggle");
	act(() => {
		item?.run(editor, { from: 1, to: 8 });
	});
	const [first] = editor.getJSON().content ?? [];
	expect(first?.type).toBe("toggle");
	expect(first?.attrs?.open).toBe(true);
	expect(first?.content?.map((node) => node.type)).toEqual(["paragraph"]);
});

it("turns a heading into a plain summary line when the toggle is made", () => {
	const editor = open({
		type: "doc",
		content: [
			{
				type: "heading",
				attrs: { id: "h", level: 1 },
				content: [{ type: "text", text: "/toggle" }],
			},
		],
	});
	act(() => {
		SLASH_ITEMS.find((i) => i.id === "toggle")?.run(editor, { from: 1, to: 8 });
	});
	expect(types(editor)).toEqual(["toggle"]);
	expect(editor.state.doc.firstChild?.firstChild?.type.name).toBe("paragraph");
});

it("saves open only while it is true, as a block attribute", () => {
	const editor = open({
		type: "doc",
		content: [
			toggle("t", true, para("s", "Summary"), para("b", "Body")),
			toggle("u", false, para("us", "Closed")),
		],
	});
	const blocks = docToBlocks(editor.getJSON());
	expect(blocks.find((b) => b.id === "t")?.attrs).toEqual({ open: true });
	expect(blocks.find((b) => b.id === "u")?.attrs).toBeUndefined();
	expect(blocks.filter((b) => b.parent === "t").map((b) => b.id)).toEqual([
		"s",
		"b",
	]);
});

it("collapses and expands from the chevron, and not when read-only", async () => {
	const editor = open({
		type: "doc",
		content: [toggle("t", true, para("s", "Summary"), para("b", "Body"))],
	});
	await waitFor(() =>
		expect(document.querySelector(".toggle-chevron")).not.toBeNull(),
	);
	const chevron = document.querySelector(".toggle-chevron") as HTMLElement;
	expect(chevron.getAttribute("aria-expanded")).toBe("true");
	fireEvent.click(chevron);
	expect(toggleAttrs(editor)?.open).toBe(false);
	await waitFor(() =>
		expect(document.querySelector(".toggle")?.getAttribute("data-open")).toBe(
			"false",
		),
	);
	expect(chevron.getAttribute("aria-expanded")).toBe("false");
	fireEvent.click(chevron);
	expect(toggleAttrs(editor)?.open).toBe(true);
	act(() => editor.setEditable(false));
	await waitFor(() =>
		expect(
			(document.querySelector(".toggle-chevron") as HTMLButtonElement).disabled,
		).toBe(true),
	);
});

it("moves the caret to the summary when the toggle is collapsed from inside its body", () => {
	const editor = open({
		type: "doc",
		content: [toggle("t", true, para("s", "Summary"), para("b", "Body"))],
	});
	act(() => {
		editor.commands.setTextSelection(editor.state.doc.content.size - 2);
	});
	expect(editor.state.selection.$from.parent.textContent).toBe("Body");
	act(() => {
		editor.commands.updateAttributes("toggle", { open: false });
	});
	expect(editor.state.selection.$from.parent.textContent).toBe("Summary");
	expect(editor.state.selection.$from.parentOffset).toBe("Summary".length);
});

it("keeps the caret out of the hidden body of a closed toggle", () => {
	const editor = open({
		type: "doc",
		content: [toggle("t", false, para("s", "Summary"), para("b", "Body"))],
	});
	act(() => {
		editor.commands.setTextSelection(editor.state.doc.content.size - 2);
	});
	expect(editor.state.selection.$from.parent.textContent).toBe("Summary");
});

it("opens a closed toggle and starts its body when Enter is pressed at the end of the summary", () => {
	const editor = open({
		type: "doc",
		content: [toggle("t", false, para("s", "Summary"))],
	});
	act(() => {
		editor.commands.setTextSelection(1 + "Summary".length + 1);
		editor.commands.keyboardShortcut("Enter");
	});
	expect(toggleAttrs(editor)?.open).toBe(true);
	const node = editor.state.doc.firstChild;
	expect(node?.childCount).toBe(2);
	expect(editor.state.selection.$from.parent).toBe(node?.child(1));
});

it("starts the body below the summary when Enter is pressed in an open toggle", () => {
	const editor = open({
		type: "doc",
		content: [toggle("t", true, para("s", "Summary"))],
	});
	act(() => {
		editor.commands.setTextSelection(1 + "Summary".length + 1);
		editor.commands.keyboardShortcut("Enter");
	});
	expect(editor.state.doc.firstChild?.childCount).toBe(2);
	expect(editor.state.selection.$from.index(-1)).toBe(1);
});

it("leaves the toggle when Enter is pressed on an empty last line", () => {
	const editor = open({
		type: "doc",
		content: [toggle("t", true, para("s", "Summary"), para("b"))],
	});
	act(() => {
		editor.commands.setTextSelection(editor.state.doc.content.size - 2);
		editor.commands.keyboardShortcut("Enter");
	});
	expect(types(editor)).toEqual(["toggle", "paragraph"]);
	expect(editor.state.doc.firstChild?.childCount).toBe(1);
});

it("unwraps one level when Backspace is pressed at the very start of the summary", () => {
	const editor = open({
		type: "doc",
		content: [toggle("t", true, para("s", "Summary"), para("b", "Body"))],
	});
	act(() => {
		editor.commands.setTextSelection(2);
		editor.commands.keyboardShortcut("Backspace");
	});
	expect(types(editor)).toEqual(["paragraph", "toggle"]);
	expect(editor.state.doc.child(1).firstChild?.textContent).toBe("Body");
});

it("holds any block in the body, including a list and another toggle", () => {
	const editor = open({
		type: "doc",
		content: [
			toggle(
				"t",
				true,
				para("s", "Summary"),
				{
					type: "bulletList",
					attrs: { id: "ul" },
					content: [
						{
							type: "listItem",
							attrs: { id: "li" },
							content: [para("lp", "Item")],
						},
					],
				},
				toggle("inner", false, para("is", "Inner")),
			),
		],
	});
	const blocks = docToBlocks(editor.getJSON());
	expect(blocks.map((b) => [b.id, b.parent])).toEqual([
		["t", null],
		["s", "t"],
		["ul", "t"],
		["li", "ul"],
		["lp", "li"],
		["inner", "t"],
		["is", "inner"],
	]);
});

const heading = (id: string, level: number, text?: string) => ({
	type: "heading",
	attrs: { id, level },
	...(text ? { content: [{ type: "text", text }] } : {}),
});

it("makes a toggle heading from the slash menu: an open toggle whose summary is a heading", () => {
	for (const level of [1, 2]) {
		const editor = open({ type: "doc", content: [para("a", "/th")] });
		act(() => {
			SLASH_ITEMS.find((i) => i.id === `toggle-heading${level}`)?.run(editor, {
				from: 1,
				to: 4,
			});
		});
		const [first] = editor.getJSON().content ?? [];
		expect(first?.type).toBe("toggle");
		expect(first?.attrs?.open).toBe(true);
		expect(first?.content?.[0]?.type).toBe("heading");
		expect(
			(first?.content?.[0] as { attrs?: { level?: number } })?.attrs?.level,
		).toBe(level);
		cleanup();
	}
});

it("saves a toggle heading as a toggle line with the heading as its first child, open only while true", () => {
	const editor = open({
		type: "doc",
		content: [
			toggle("t", true, heading("s", 1, "Chapter"), para("b", "Body")),
			toggle("u", false, heading("us", 2, "Closed")),
		],
	});
	const blocks = docToBlocks(editor.getJSON());
	expect(blocks.map((b) => [b.id, b.type, b.parent])).toEqual([
		["t", "toggle", null],
		["s", "heading", "t"],
		["b", "paragraph", "t"],
		["u", "toggle", null],
		["us", "heading", "u"],
	]);
	expect(blocks.find((b) => b.id === "t")?.attrs).toEqual({ open: true });
	expect(blocks.find((b) => b.id === "u")?.attrs).toBeUndefined();
	// Level 1 is the default, so it is left out of the file; level 2 is written.
	expect(blocks.find((b) => b.id === "s")?.attrs).toBeUndefined();
	expect(blocks.find((b) => b.id === "us")?.attrs).toEqual({ level: 2 });
});

it("shows the kind of summary on the toggle and folds from the chevron like any toggle", async () => {
	const editor = open({
		type: "doc",
		content: [toggle("t", true, heading("s", 2, "Chapter"), para("b", "Body"))],
	});
	await waitFor(() =>
		expect(
			document.querySelector(".toggle")?.getAttribute("data-summary"),
		).toBe("h2"),
	);
	fireEvent.click(document.querySelector(".toggle-chevron") as HTMLElement);
	expect(toggleAttrs(editor)?.open).toBe(false);
	// The caret is never left inside the hidden body.
	act(() => {
		editor.commands.setTextSelection(editor.state.doc.content.size - 2);
	});
	expect(editor.state.selection.$from.parent.type.name).toBe("heading");
});

it("starts the body as a paragraph when Enter is pressed at the end of a closed toggle heading", () => {
	const editor = open({
		type: "doc",
		content: [toggle("t", false, heading("s", 1, "Chapter"))],
	});
	act(() => {
		editor.commands.setTextSelection(1 + "Chapter".length + 1);
		editor.commands.keyboardShortcut("Enter");
	});
	expect(toggleAttrs(editor)?.open).toBe(true);
	const node = editor.state.doc.firstChild;
	expect(node?.childCount).toBe(2);
	expect(node?.child(0).type.name).toBe("heading");
	expect(node?.child(1).type.name).toBe("paragraph");
	expect(editor.state.selection.$from.parent).toBe(node?.child(1));
});

it("turns a toggle heading back into a plain heading with its body after it, losing nothing", () => {
	const editor = open({
		type: "doc",
		content: [
			para("a", "Before"),
			toggle(
				"t",
				true,
				heading("s", 1, "Chapter"),
				para("b", "Body"),
				toggle("inner", false, para("is", "Inner")),
			),
		],
	});
	act(() => {
		editor.commands.setTextSelection(editor.state.doc.child(0).nodeSize + 2);
		press(editor, "Backspace");
	});
	expect(types(editor)).toEqual([
		"paragraph",
		"heading",
		"paragraph",
		"toggle",
	]);
	expect(editor.state.doc.child(1).textContent).toBe("Chapter");
	expect(editor.state.doc.child(2).textContent).toBe("Body");
	expect(editor.state.doc.child(3).textContent).toBe("Inner");
	// The caret is at the start of the heading.
	expect(editor.state.selection.$from.parent.type.name).toBe("heading");
	expect(editor.state.selection.$from.parentOffset).toBe(0);
});

it("does the same for a toggle heading inside a quote", () => {
	const editor = open({
		type: "doc",
		content: [
			{
				type: "blockquote",
				attrs: { id: "q" },
				content: [
					toggle("t", true, heading("s", 2, "Inside"), para("b", "Body")),
				],
			},
		],
	});
	act(() => {
		editor.commands.setTextSelection(3);
		press(editor, "Backspace");
	});
	const quote = editor.state.doc.firstChild;
	expect(quote?.type.name).toBe("blockquote");
	expect(quote?.content.content.map((n) => n.type.name)).toEqual([
		"heading",
		"paragraph",
	]);
	expect(quote?.textContent).toBe("InsideBody");
});
