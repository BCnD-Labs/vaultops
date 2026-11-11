// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import type { JSONContent } from "@tiptap/core";
import { type Editor, EditorContent, useEditor } from "@tiptap/react";
import { afterEach, describe, expect, it } from "vitest";
import { createExtensions } from "./extensions";

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

const task = (id: string, text?: string, checked = false) => ({
	type: "taskBlock",
	attrs: { id, checked },
	...(text ? { content: [{ type: "text", text }] } : {}),
});
const para = (id: string, text?: string) => ({
	type: "paragraph",
	attrs: { id },
	...(text ? { content: [{ type: "text", text }] } : {}),
});
const doc = (...content: object[]) => ({ type: "doc", content });
const nodes = (editor: Editor) => editor.getJSON().content ?? [];
const textOf = (n: JSONContent | undefined) =>
	(n?.content ?? []).map((c) => c.text ?? "").join("");

/** Send a key through the editor's own key handlers, as a user's keypress would. */
function press(editor: Editor, key: string): boolean {
	const event = new KeyboardEvent("keydown", { key, cancelable: true });
	return !!editor.view.someProp("handleKeyDown", (f) => f(editor.view, event));
}
/** Place the caret `offset` characters into the block that starts at `blockPos`. */
function caret(editor: Editor, blockPos: number, offset: number) {
	act(() => {
		editor.commands.setTextSelection(blockPos + 1 + offset);
	});
}

describe("task block display", () => {
	it("shows an unchecked box and the text beside it", () => {
		open(doc(task("a", "Buy milk")));
		const box = document.querySelector<HTMLInputElement>(".task-block-box");
		expect(box?.checked).toBe(false);
		expect(box?.getAttribute("aria-label")).toBe("Done");
		expect(document.querySelector(".task-block-text")?.textContent).toBe(
			"Buy milk",
		);
		expect(
			document.querySelector<HTMLElement>(".task-block")?.dataset.checked,
		).toBe("false");
	});

	it("shows a checked task as checked", () => {
		open(doc(task("a", "Done thing", true)));
		expect(
			document.querySelector<HTMLInputElement>(".task-block-box")?.checked,
		).toBe(true);
		expect(
			document.querySelector<HTMLElement>(".task-block")?.dataset.checked,
		).toBe("true");
	});

	it("ticking the box saves checked on the block and keeps its id and text", () => {
		const editor = open(doc(task("a", "Buy milk")));
		const box = document.querySelector<HTMLInputElement>(
			".task-block-box",
		) as HTMLInputElement;
		act(() => {
			box.checked = true;
			fireEvent.change(box);
		});
		const [first] = nodes(editor);
		expect(first?.attrs).toMatchObject({ id: "a", checked: true });
		expect(textOf(first)).toBe("Buy milk");
		act(() => {
			box.checked = false;
			fireEvent.change(box);
		});
		expect(nodes(editor)[0]?.attrs?.checked).toBe(false);
	});

	it("updates the box when the checked state changes from outside", () => {
		const editor = open(doc(task("a", "Buy milk")));
		act(() => {
			editor.commands.command(({ tr }) => {
				tr.setNodeMarkup(0, undefined, { id: "a", checked: true });
				return true;
			});
		});
		expect(
			document.querySelector<HTMLInputElement>(".task-block-box")?.checked,
		).toBe(true);
	});

	it("reads checked from HTML", () => {
		const editor = open(
			'<div data-type="task-block" data-checked="true">From html</div>' as unknown as object,
		);
		expect(nodes(editor)[0]?.type).toBe("taskBlock");
		expect(nodes(editor)[0]?.attrs?.checked).toBe(true);
	});
});

describe("task block Enter", () => {
	it("continues with a new unchecked task, splitting at the caret", () => {
		const editor = open(doc(task("a", "Buy milk", true)));
		caret(editor, 0, 3);
		expect(press(editor, "Enter")).toBe(true);
		const list = nodes(editor);
		expect(list.map((n) => n.type)).toEqual(["taskBlock", "taskBlock"]);
		expect(textOf(list[0])).toBe("Buy");
		expect(textOf(list[1])).toBe(" milk");
		expect(list[1]?.attrs?.checked).toBe(false);
	});

	it("at the end of a task starts an empty unchecked task", () => {
		const editor = open(doc(task("a", "Buy milk")));
		caret(editor, 0, 8);
		press(editor, "Enter");
		const list = nodes(editor);
		expect(list.map((n) => n.type)).toEqual(["taskBlock", "taskBlock"]);
		expect(textOf(list[1])).toBe("");
		expect(list[1]?.attrs?.checked).toBe(false);
	});

	it("on an empty task ends the list: the task becomes a paragraph with the same id", () => {
		const editor = open(doc(task("a", "Buy milk"), task("b")));
		const secondPos = editor.state.doc.firstChild?.nodeSize ?? 0;
		caret(editor, secondPos, 0);
		expect(press(editor, "Enter")).toBe(true);
		const list = nodes(editor);
		expect(list.map((n) => n.type)).toEqual(["taskBlock", "paragraph"]);
		expect(list[1]?.attrs?.id).toBe("b");
	});

	it("does nothing special in a paragraph", () => {
		const editor = open(doc(para("a", "Plain")));
		caret(editor, 0, 5);
		press(editor, "Enter");
		expect(nodes(editor).every((n) => n.type !== "taskBlock")).toBe(true);
	});
});

describe("task block Backspace", () => {
	it("at the start turns the task back into a paragraph, keeping text and id", () => {
		const editor = open(doc(task("a", "Buy milk")));
		caret(editor, 0, 0);
		expect(press(editor, "Backspace")).toBe(true);
		const [first] = nodes(editor);
		expect(first?.type).toBe("paragraph");
		expect(first?.attrs?.id).toBe("a");
		expect(textOf(first)).toBe("Buy milk");
	});

	it("inside the text it is left to normal deletion", () => {
		const editor = open(doc(task("a", "Buy milk")));
		caret(editor, 0, 3);
		press(editor, "Backspace");
		expect(nodes(editor)[0]?.type).toBe("taskBlock");
	});

	it("does not touch a paragraph", () => {
		const editor = open(doc(para("a", "Plain")));
		caret(editor, 0, 0);
		press(editor, "Backspace");
		expect(nodes(editor)[0]?.type).toBe("paragraph");
	});
});
