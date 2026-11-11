// @vitest-environment happy-dom
import { act, cleanup, render } from "@testing-library/react";
import type { JSONContent } from "@tiptap/core";
import { type Editor, EditorContent, useEditor } from "@tiptap/react";
import { afterEach, expect, it } from "vitest";
import { blocksToDoc, checkBlocks, docToBlocks } from "./doc-blocks";
import { createExtensions } from "./extensions";
import { moveListItem } from "./list-nesting";

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

/** Type text one character at a time, through the editor's input rules. */
function type(editor: Editor, text: string) {
	for (const ch of text) {
		act(() => {
			const { from, to } = editor.state.selection;
			const handled = editor.view.someProp("handleTextInput", (f) =>
				f(editor.view, from, to, ch, () =>
					editor.state.tr.insertText(ch, from, to),
				),
			);
			if (!handled)
				editor.view.dispatch(editor.state.tr.insertText(ch, from, to));
		});
	}
}

function press(editor: Editor, key: string, shift = false): boolean {
	const event = new KeyboardEvent("keydown", {
		key,
		shiftKey: shift,
		cancelable: true,
	});
	return !!editor.view.someProp("handleKeyDown", (f) => f(editor.view, event));
}

/** The document as nested types and text only. */
type Shape = { t: string; x?: string; c?: Shape[] };
function shape(node: JSONContent): Shape {
	return {
		t: node.type ?? "",
		...(node.text ? { x: node.text } : {}),
		...(node.content ? { c: node.content.map(shape) } : {}),
	};
}
const text = (x: string): Shape => ({ t: "text", x });
const p = (x?: string): Shape => ({
	t: "paragraph",
	...(x ? { c: [text(x)] } : {}),
});
const li = (...c: Shape[]): Shape => ({ t: "listItem", c });
const ol = (...c: Shape[]): Shape => ({ t: "orderedList", c });
const ul = (...c: Shape[]): Shape => ({ t: "bulletList", c });
const doc = (...c: Shape[]): Shape => ({ t: "doc", c });

const item = (id: string, words?: string, ...nested: JSONContent[]) => ({
	type: "listItem",
	attrs: { id },
	content: [
		{
			type: "paragraph",
			attrs: { id: `${id}-p` },
			...(words ? { content: [{ type: "text", text: words }] } : {}),
		},
		...nested,
	],
});
const list = (kind: string, ...items: JSONContent[]) => ({
	type: "doc",
	content: [{ type: kind, attrs: { id: "list" }, content: items }],
});

/** Put the caret at the start of the list item with this id. */
function caretIn(editor: Editor, id: string) {
	let at = -1;
	editor.state.doc.descendants((node, pos) => {
		if (node.attrs.id === id) at = pos + 2;
		return at < 0;
	});
	act(() => {
		editor.commands.setTextSelection(at);
	});
}

afterEach(() => {
	cleanup();
	current = null;
});

it("nests a bullet under a numbered item when the next item starts with a dash", () => {
	const editor = open(
		list("orderedList", item("a", "urban centers"), item("b")),
	);
	caretIn(editor, "b");
	type(editor, "- dense urban populations");
	expect(shape(editor.getJSON())).toEqual(
		doc(ol(li(p("urban centers"), ul(li(p("dense urban populations")))))),
	);
});

it("nests numbers under a bullet with 1., keeping the item's text", () => {
	const editor = open(list("bulletList", item("a", "steps"), item("b", "mix")));
	caretIn(editor, "b");
	type(editor, "1. ");
	expect(shape(editor.getJSON())).toEqual(
		doc(ul(li(p("steps"), ol(li(p("mix")))))),
	);
});

it("switches a list's kind from its first item, and leaves the text when it already is that kind", () => {
	const numbered = open(list("orderedList", item("a"), item("b", "two")));
	caretIn(numbered, "a");
	type(numbered, "- ");
	expect(shape(numbered.getJSON())).toEqual(doc(ul(li(p()), li(p("two")))));
	expect(numbered.getJSON().content?.[0]?.attrs?.id).toBe("list");
	cleanup();
	const bullets = open(list("bulletList", item("a"), item("b", "two")));
	caretIn(bullets, "a");
	type(bullets, "- ");
	expect(shape(bullets.getJSON())).toEqual(doc(ul(li(p("- ")), li(p("two")))));
});

it("nests with Tab, moves back out with Shift-Tab, and keeps Tab in the note on a first item", () => {
	const editor = open(list("orderedList", item("a", "one"), item("b", "two")));
	caretIn(editor, "a");
	expect(press(editor, "Tab")).toBe(true);
	expect(shape(editor.getJSON())).toEqual(doc(ol(li(p("one")), li(p("two")))));
	caretIn(editor, "b");
	press(editor, "Tab");
	expect(shape(editor.getJSON())).toEqual(
		doc(ol(li(p("one"), ol(li(p("two")))))),
	);
	press(editor, "Tab", true);
	expect(shape(editor.getJSON())).toEqual(doc(ol(li(p("one")), li(p("two")))));
});

it("moves an item up and down among its siblings, children and all", () => {
	const editor = open(
		list(
			"orderedList",
			item("a", "one"),
			item("b", "two", {
				type: "bulletList",
				attrs: { id: "sub" },
				content: [item("c", "detail")],
			}),
			item("d", "three"),
		),
	);
	const move = (dir: -1 | 1) =>
		act(() => {
			moveListItem(editor.state, editor.view.dispatch, dir);
		});
	caretIn(editor, "b");
	move(-1);
	expect(shape(editor.getJSON())).toEqual(
		doc(ol(li(p("two"), ul(li(p("detail")))), li(p("one")), li(p("three")))),
	);
	expect(editor.state.selection.$from.parent.textContent).toBe("two");
	move(-1);
	expect(shape(editor.getJSON()).c?.[0]?.c?.[0]?.c?.[0]).toEqual(p("two"));
	move(1);
	move(1);
	expect(shape(editor.getJSON())).toEqual(
		doc(ol(li(p("one")), li(p("three")), li(p("two"), ul(li(p("detail")))))),
	);
	caretIn(editor, "a");
	expect(moveListItem(editor.state, undefined, -1)).toBe(true);
});

it("saves and reopens a numbered list with nested bullets unchanged", () => {
	const editor = open(
		list("orderedList", item("a", "urban centers"), item("b")),
	);
	caretIn(editor, "b");
	type(editor, "- dense");
	const blocks = docToBlocks(editor.getJSON());
	expect(checkBlocks(blocks)).toEqual({ ok: true });
	expect(shape(blocksToDoc(blocks))).toEqual(shape(editor.getJSON()));
});
