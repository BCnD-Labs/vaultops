import { Editor, type JSONContent } from "@tiptap/core";
import { afterEach, expect, it } from "vitest";
import { createExtensions } from "./extensions";
import { findMovable, moveOut } from "./move-out";

let editor: Editor | null = null;
afterEach(() => editor?.destroy());

const p = (id: string, text: string): JSONContent => ({
	type: "paragraph",
	attrs: { id },
	content: [{ type: "text", text }],
});
const task = (id: string, text: string): JSONContent => ({
	type: "taskBlock",
	attrs: { id, checked: false },
	content: [{ type: "text", text }],
});
const make = (content: JSONContent[]) => {
	editor = new Editor({
		extensions: createExtensions(),
		content: { type: "doc", content },
	});
	return editor;
};
const shape = (e: Editor) =>
	e
		.getJSON()
		.content?.map((n) => `${n.type}:${n.attrs?.id}`)
		.join(" ");
const posOf = (e: Editor, id: string) => {
	let found = -1;
	e.state.doc.descendants((node, pos) => {
		if (node.attrs.id === id) found = pos;
	});
	return found;
};

const listWithTask = (): JSONContent[] => [
	{
		type: "bulletList",
		attrs: { id: "list" },
		content: [
			{
				type: "listItem",
				attrs: { id: "item" },
				content: [p("lead", "Item"), task("t", "Nested task")],
			},
			{
				type: "listItem",
				attrs: { id: "item2" },
				content: [p("lead2", "Second")],
			},
		],
	},
	p("after", "After"),
];

it("moves a task nested in a list item to just below the whole list", () => {
	const e = make(listWithTask());
	const pos = posOf(e, "t");
	expect(findMovable(e.state.doc, pos + 1)?.from).toBe("list");
	expect(moveOut(e, pos)).toBe(true);
	expect(shape(e)).toBe("bulletList:list taskBlock:t paragraph:after");
	// The list keeps both items and the task is not copied.
	const list = e.getJSON().content?.[0];
	expect(list?.content).toHaveLength(2);
	expect(JSON.stringify(list)).not.toContain('"t"');
});

it("leaves a list item's own text, and a quote's only block, in place", () => {
	const e = make([
		...listWithTask(),
		{
			type: "blockquote",
			attrs: { id: "q" },
			content: [p("qp", "Only")],
		},
	]);
	expect(findMovable(e.state.doc, posOf(e, "lead") + 1)).toBeNull();
	expect(findMovable(e.state.doc, posOf(e, "qp") + 1)).toBeNull();
	expect(moveOut(e, posOf(e, "lead"))).toBe(false);
});

it("moves one paragraph out of a quote with several", () => {
	const e = make([
		{
			type: "blockquote",
			attrs: { id: "q" },
			content: [p("a", "A"), p("b", "B")],
		},
	]);
	expect(moveOut(e, posOf(e, "b"))).toBe(true);
	expect(shape(e)).toBe("blockquote:q paragraph:b");
});
