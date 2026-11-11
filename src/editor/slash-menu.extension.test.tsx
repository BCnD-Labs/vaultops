// @vitest-environment happy-dom
import { act, cleanup, render } from "@testing-library/react";
import { type Editor, EditorContent, useEditor } from "@tiptap/react";
import { afterEach, expect, it } from "vitest";
import { createExtensions } from "./extensions";

let current: Editor | null = null;
function Harness() {
	const editor = useEditor({
		extensions: createExtensions(),
		content: {
			type: "doc",
			content: [{ type: "paragraph", attrs: { id: "a" } }],
		},
	});
	current = editor;
	return <EditorContent editor={editor} />;
}
afterEach(() => {
	cleanup();
	current = null;
	document.body.replaceChildren();
});
function open(): Editor {
	render(<Harness />);
	if (!current) throw new Error("no editor");
	return current;
}
// The suggestion plugin fetches its items asynchronously, so let it settle.
const insert = (editor: Editor, text: string) =>
	act(async () => {
		editor.commands.insertContent(text);
		await new Promise((resolve) => setTimeout(resolve, 0));
	});
const menu = () => document.querySelector(".slash-menu");
const labels = () =>
	[...document.querySelectorAll(".slash-menu-label")].map((l) => l.textContent);

it("opens when / is typed at the start of a block and filters as you type", async () => {
	const editor = open();
	await insert(editor, "/");
	expect(menu()).toBeTruthy();
	expect(labels()).toContain("Heading 1");
	await insert(editor, "tabl");
	expect(labels()).toEqual(["Table"]);
});

it("opens after a space but not inside a word", async () => {
	const editor = open();
	await insert(editor, "word/");
	expect(menu()).toBeNull();
	await insert(editor, " /");
	expect(menu()).toBeTruthy();
});

it("shows 'No matches' and closes when the text is cleared", async () => {
	const editor = open();
	await insert(editor, "/zzzz");
	expect(document.querySelector(".slash-menu-empty")).toBeTruthy();
	await act(async () => {
		editor.commands.clearContent();
		await new Promise((resolve) => setTimeout(resolve, 0));
	});
	expect(menu()).toBeNull();
});

it("choosing an item removes the typed query and makes the block", async () => {
	const editor = open();
	await insert(editor, "/head");
	const row = document.querySelector<HTMLElement>(
		'.slash-menu-item[data-id="heading1"]',
	);
	expect(row).toBeTruthy();
	await act(async () => {
		row?.dispatchEvent(
			new MouseEvent("mousedown", { bubbles: true, cancelable: true }),
		);
	});
	const first = editor.getJSON().content?.[0];
	expect(first?.type).toBe("heading");
	expect(first?.attrs?.level).toBe(1);
	expect(first?.content ?? []).toEqual([]);
	expect(menu()).toBeNull();
});

it("Enter chooses from the menu inside a task block, not a new task", async () => {
	const editor = open();
	await act(async () => {
		editor.commands.setContent({
			type: "doc",
			content: [{ type: "taskBlock", attrs: { id: "t" } }],
		});
	});
	await insert(editor, "/table");
	await act(async () => {
		editor.view.someProp("handleKeyDown", (f) =>
			f(editor.view, new KeyboardEvent("keydown", { key: "Enter" })),
		);
	});
	expect(editor.getJSON().content?.map((node) => node.type)).toEqual(["table"]);
});
