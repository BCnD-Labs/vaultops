// @vitest-environment happy-dom

import { Editor } from "@tiptap/core";
import { afterEach, expect, it } from "vitest";
import { setDropSlot } from "./drop-slot";
import { createExtensions } from "./extensions";

let editor: Editor | null = null;
afterEach(() => editor?.destroy());

it("shows a line, and names the block it would nest in", () => {
	editor = new Editor({
		element: document.createElement("div"),
		extensions: createExtensions(),
		content: {
			type: "doc",
			content: [
				{
					type: "blockquote",
					attrs: { id: "q" },
					content: [
						{
							type: "paragraph",
							attrs: { id: "a" },
							content: [{ type: "text", text: "A" }],
						},
						{
							type: "paragraph",
							attrs: { id: "b" },
							content: [{ type: "text", text: "B" }],
						},
					],
				},
			],
		},
	});
	const dom = editor.view.dom;
	setDropSlot(editor.view, { pos: 0, index: 0, nest: null });
	expect(dom.querySelectorAll(".block-drop-slot")).toHaveLength(1);
	expect(dom.querySelector(".drop-nest-target")).toBeNull();

	const quote = editor.state.doc.child(0);
	const inside = 1 + quote.child(0).nodeSize;
	setDropSlot(editor.view, {
		pos: inside,
		index: null,
		nest: { from: 0, to: quote.nodeSize, label: "quote" },
	});
	const target = dom.querySelector(".drop-nest-target");
	expect(target?.getAttribute("data-nest-label")).toBe("Nest in quote");
	expect(dom.querySelector("blockquote > .block-drop-slot")).not.toBeNull();

	setDropSlot(editor.view, null);
	expect(dom.querySelector(".block-drop-slot")).toBeNull();
	expect(dom.querySelector(".drop-nest-target")).toBeNull();
});
