// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { type Editor, EditorContent, useEditor } from "@tiptap/react";
import { afterEach, expect, it } from "vitest";
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

afterEach(() => {
	cleanup();
	current = null;
});

it("moves a divider to the next style on double click", () => {
	const editor = open({
		type: "doc",
		content: [{ type: "divider", attrs: { id: "d" } }],
	});
	const { view } = editor;
	const node = view.state.doc.nodeAt(0);
	if (!node) throw new Error("no divider");
	const click = () =>
		act(() => {
			view.someProp("handleDoubleClickOn", (f) =>
				f(view, 0, node, 0, new MouseEvent("dblclick") as never, true),
			);
		});
	const style = () => view.state.doc.nodeAt(0)?.attrs.style;
	expect(style()).toBe("solid");
	click();
	expect(style()).toBe("dashed");
});

it("inserts a dated chip from the slash menu, and saves it as inline content", () => {
	const editor = open({
		type: "doc",
		content: [
			{
				type: "paragraph",
				attrs: { id: "p" },
				content: [{ type: "text", text: "/" }],
			},
		],
	});
	const item = SLASH_ITEMS.find((i) => i.id === "date");
	if (!item) throw new Error("no date item");
	act(() => item.run(editor, { from: 1, to: 2 }));
	const [first] = editor.getJSON().content ?? [];
	const chip = first?.content?.find((n) => n.type === "date");
	expect(
		(chip as { attrs?: { date?: string } } | undefined)?.attrs?.date,
	).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});

it("sets the language of a code block from its picker and highlights tokens", () => {
	const editor = open({
		type: "doc",
		content: [
			{
				type: "codeBlock",
				attrs: { id: "c" },
				content: [{ type: "text", text: "let x = 1;" }],
			},
		],
	});
	const picker = document.querySelector<HTMLSelectElement>(".code-language");
	if (!picker) throw new Error("no language picker");
	expect(picker.value).toBe("");
	expect(document.querySelectorAll(".hljs-keyword").length).toBe(0);
	act(() => {
		picker.value = "rust";
		fireEvent.change(picker);
	});
	expect(editor.getJSON().content?.[0]?.attrs?.language).toBe("rust");
	expect(document.querySelector(".hljs-keyword")?.textContent).toBe("let");

	act(() => {
		editor.setEditable(false);
	});
	const label = document.querySelector(".code-language");
	expect(label?.tagName).toBe("SPAN");
	expect(label?.textContent).toBe("Rust");
});

it("copies the code block text from the Copy button", () => {
	open({
		type: "doc",
		content: [
			{
				type: "codeBlock",
				attrs: { id: "c", language: "rust" },
				content: [{ type: "text", text: "fn main() {}" }],
			},
		],
	});
	let copied = "";
	Object.defineProperty(navigator, "clipboard", {
		configurable: true,
		value: {
			writeText: async (text: string) => {
				copied = text;
			},
		},
	});
	const button = document.querySelector<HTMLButtonElement>(".code-copy");
	if (!button) throw new Error("no copy button");
	expect(button.textContent).toBe("Copy");
	act(() => {
		fireEvent.click(button);
	});
	expect(copied).toBe("fn main() {}");
	expect(button.textContent).toBe("Copied");
});

it("marks text as a keyboard key", () => {
	const editor = open({
		type: "doc",
		content: [
			{
				type: "paragraph",
				attrs: { id: "p" },
				content: [{ type: "text", text: "Ctrl" }],
			},
		],
	});
	act(() => {
		editor.chain().setTextSelection({ from: 1, to: 5 }).toggleMark("kbd").run();
	});
	expect(editor.getJSON().content?.[0]?.content?.[0]?.marks).toEqual([
		{ type: "kbd" },
	]);
});
