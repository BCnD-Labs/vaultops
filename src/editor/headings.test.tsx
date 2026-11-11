// @vitest-environment happy-dom

import { cleanup, render } from "@testing-library/react";
import { type Editor, EditorContent, useEditor } from "@tiptap/react";
import { afterEach, expect, it } from "vitest";
import { blocksToDoc, docToBlocks } from "./doc-blocks";
import { createExtensions } from "./extensions";
import { filterSlashItems, SLASH_ITEMS } from "./slash-items";

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

const para = (id: string, text?: string) => ({
	type: "paragraph",
	attrs: { id },
	...(text ? { content: [{ type: "text", text }] } : {}),
});

afterEach(() => {
	cleanup();
	current = null;
});

it("offers Heading 1 to Heading 6 in the slash menu, each found by /hN", () => {
	for (const level of [1, 2, 3, 4, 5, 6]) {
		const found = filterSlashItems(`h${level}`).map((item) => item.id);
		expect(found).toContain(`heading${level}`);
		const item = SLASH_ITEMS.find((i) => i.id === `heading${level}`);
		expect(item?.label).toBe(`Heading ${level}`);
		expect(item?.hint).toBe("#".repeat(level));
	}
});

it("turns the block into the picked heading level from the slash menu", () => {
	const editor = open({ type: "doc", content: [para("a", "/")] });
	for (const level of [3, 4, 5, 6]) {
		editor.commands.setContent({ type: "doc", content: [para("a", "/")] });
		editor.commands.focus("end");
		const item = SLASH_ITEMS.find((i) => i.id === `heading${level}`);
		item?.run(editor, { from: 1, to: 2 });
		const first = editor.getJSON().content?.[0];
		expect(first?.type).toBe("heading");
		expect(first?.attrs?.level).toBe(level);
	}
});

it("accepts a heading of every level and the markdown and key shortcuts make them", () => {
	const editor = open({ type: "doc", content: [para("a", "x")] });
	for (const level of [1, 2, 3, 4, 5, 6]) {
		editor.commands.setContent({ type: "doc", content: [para("a", "x")] });
		editor.commands.focus("end");
		editor.commands.setHeading({ level: level as 1 });
		expect(editor.getJSON().content?.[0]?.attrs?.level).toBe(level);
	}
	const { view } = editor;
	// `#####` then a space at the start of an empty line is the markdown shortcut.
	editor.commands.setContent({ type: "doc", content: [para("b")] });
	editor.commands.focus("end");
	editor.commands.insertContent("#####");
	const at = view.state.selection.from;
	view.someProp("handleTextInput", (f) =>
		f(view, at, at, " ", () => view.state.tr),
	);
	expect(editor.getJSON().content?.[0]?.attrs?.level).toBe(5);
	// Ctrl+Alt+6 (Cmd+Alt+6 on a Mac) mirrors the slash menu.
	editor.commands.setContent({ type: "doc", content: [para("c", "y")] });
	editor.commands.focus("end");
	const key = new KeyboardEvent("keydown", {
		key: "6",
		altKey: true,
		ctrlKey: true,
		cancelable: true,
	});
	view.someProp("handleKeyDown", (f) => f(view, key));
	expect(editor.getJSON().content?.[0]?.attrs?.level).toBe(6);
});

it("round-trips a level 5 heading through docToBlocks and blocksToDoc", () => {
	const doc = {
		type: "doc",
		content: [
			{
				type: "heading",
				attrs: { id: "h5", level: 5 },
				content: [{ type: "text", text: "Small heading" }],
			},
		],
	};
	const blocks = docToBlocks(doc);
	expect(blocks[0]).toMatchObject({ id: "h5", type: "heading" });
	expect(blocks[0]?.attrs).toMatchObject({ level: 5 });
	expect(blocksToDoc(blocks).content?.[0]?.attrs).toMatchObject({
		id: "h5",
		level: 5,
	});
	// And the editor keeps it as a level 5 heading, not a paragraph or level 1.
	const editor = open(blocksToDoc(blocks));
	expect(editor.getJSON().content?.[0]?.attrs?.level).toBe(5);
});
