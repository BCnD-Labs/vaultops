// @vitest-environment happy-dom

import { act, cleanup, render } from "@testing-library/react";
import { type Editor, EditorContent, useEditor } from "@tiptap/react";
import { afterEach, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { blocksToDoc } from "./doc-blocks";
import { createExtensions } from "./extensions";
import { insertBlocksAtCaret } from "./insert-blocks";
import { NoteEditor, type TemplateRequest } from "./NoteEditor";
import { SLASH_ITEMS, TEMPLATE_EVENT } from "./slash-items";

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

const para = (id: string, text?: string) => ({
	type: "paragraph",
	attrs: { id },
	...(text ? { content: [{ type: "text", text }] } : {}),
});
const doc = (...content: object[]) => ({ type: "doc", content });
const types = (editor: Editor) =>
	editor.state.doc.content.content.map((n) => n.type.name);
const texts = (editor: Editor) =>
	editor.state.doc.content.content.map((n) => n.textContent);

const starter =
	blocksToDoc([
		{
			id: "h",
			type: "heading",
			parent: null,
			content: [{ type: "text", text: "Plan" }],
		},
		{ id: "t", type: "toggle", parent: null },
		{
			id: "ts",
			type: "paragraph",
			parent: "t",
			content: [{ type: "text", text: "Why" }],
		},
		{
			id: "tb",
			type: "paragraph",
			parent: "t",
			content: [{ type: "text", text: "Because" }],
		},
	]).content ?? [];

it("replaces an empty line at the top level with the blocks", () => {
	const editor = open(doc(para("a", "Before"), para("b"), para("c", "After")));
	act(() => {
		editor.commands.setTextSelection(editor.state.doc.child(0).nodeSize + 1);
	});
	act(() => {
		insertBlocksAtCaret(editor, starter);
	});
	expect(types(editor)).toEqual([
		"paragraph",
		"heading",
		"toggle",
		"paragraph",
	]);
	expect(texts(editor)).toEqual(["Before", "Plan", "WhyBecause", "After"]);
	// The caret is after what was put in; the toggle is closed, so it rests on
	// its visible summary line, not in the hidden body.
	expect(editor.state.selection.$from.parent.textContent).toBe("Why");
});

it("goes after the block holding the caret when the line has text", () => {
	const editor = open(doc(para("a", "Before"), para("b", "After")));
	act(() => {
		editor.commands.setTextSelection(3);
	});
	act(() => {
		insertBlocksAtCaret(editor, starter);
	});
	expect(texts(editor)).toEqual(["Before", "Plan", "WhyBecause", "After"]);
});

it("goes after the whole block when the caret is inside a toggle", () => {
	const editor = open(
		doc(
			{
				type: "toggle",
				attrs: { id: "t0", open: true },
				content: [para("s", "Summary"), para("body", "Body")],
			},
			para("z", "Last"),
		),
	);
	act(() => {
		editor.commands.setTextSelection(5);
	});
	act(() => {
		insertBlocksAtCaret(editor, starter);
	});
	expect(types(editor)).toEqual(["toggle", "heading", "toggle", "paragraph"]);
	expect(editor.state.doc.child(0).childCount).toBe(2);
});

it("does nothing for no blocks", () => {
	const editor = open(doc(para("a", "Only")));
	expect(insertBlocksAtCaret(editor, [])).toBe(false);
	expect(texts(editor)).toEqual(["Only"]);
});

it("is one undo step", () => {
	const editor = open(doc(para("a", "Before"), para("b")));
	act(() => {
		editor.commands.setTextSelection(editor.state.doc.child(0).nodeSize + 1);
	});
	act(() => {
		insertBlocksAtCaret(editor, starter);
	});
	act(() => {
		editor.commands.undo();
	});
	expect(texts(editor)).toEqual(["Before", ""]);
});

it("asks the app for a template when the slash item runs, with the caret's place and an insert function", () => {
	const asked: TemplateRequest[] = [];
	render(
		<TooltipProvider>
			<NoteEditor
				doc={doc(para("a", "/"))}
				onChange={() => {}}
				onChooseTemplate={(request) => asked.push(request)}
			/>
		</TooltipProvider>,
	);
	const dom = document.querySelector<HTMLElement>(".ProseMirror");
	expect(dom?.dataset.templates).toBe("on");
	const template = SLASH_ITEMS.find((item) => item.id === "template");
	expect(template).toBeDefined();
	dom?.dispatchEvent(new CustomEvent(TEMPLATE_EVENT, { bubbles: true }));
	expect(asked).toHaveLength(1);
	expect(typeof asked[0]?.insert).toBe("function");
	expect(asked[0]?.anchor).toHaveProperty("bottom");
});

it("does not offer templates in an editor that has nobody to ask", () => {
	render(
		<TooltipProvider>
			<NoteEditor doc={doc(para("a", "x"))} onChange={() => {}} />
		</TooltipProvider>,
	);
	const dom = document.querySelector<HTMLElement>(".ProseMirror");
	expect(dom?.dataset.templates).toBe("off");
	// The event is ignored when there is no handler.
	expect(() =>
		dom?.dispatchEvent(new CustomEvent(TEMPLATE_EVENT, { bubbles: true })),
	).not.toThrow();
});

it("the slash item removes the typed slash and asks the editor's own element", () => {
	const editor = open(doc(para("a", "/templ")));
	const heard = vi.fn();
	editor.view.dom.addEventListener(TEMPLATE_EVENT, heard);
	const item = SLASH_ITEMS.find((i) => i.id === "template");
	act(() => {
		item?.run(editor, { from: 1, to: 7 });
	});
	expect(heard).toHaveBeenCalledTimes(1);
	expect(editor.state.doc.textContent).toBe("");
});
