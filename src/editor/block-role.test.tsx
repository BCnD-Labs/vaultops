// @vitest-environment happy-dom

import { cleanup, render, waitFor } from "@testing-library/react";
import { type Editor, EditorContent, useEditor } from "@tiptap/react";
import { afterEach, describe, expect, it } from "vitest";
import type { Block } from "../core/note-format";
import { knownRole } from "./block-role";
import { blocksToDoc, checkBlocks, docToBlocks } from "./doc-blocks";
import { createExtensions } from "./extensions";

let current: Editor | null = null;

function Harness({ content }: { content: object }) {
	const editor = useEditor({ extensions: createExtensions(), content });
	current = editor;
	return <EditorContent editor={editor} />;
}

function open(blocks: Block[]): { editor: Editor; root: HTMLElement } {
	const { container } = render(<Harness content={blocksToDoc(blocks)} />);
	if (!current) throw new Error("editor did not start");
	return { editor: current, root: container };
}

const text = (value: string) => [{ type: "text", text: value }] as never;

afterEach(() => {
	cleanup();
	current = null;
});

const BLOCKS: Block[] = [
	{
		id: "h",
		type: "heading",
		parent: null,
		attrs: { level: 2, role: "inbox" },
		content: text("Inbox"),
	},
	{
		id: "p",
		type: "paragraph",
		parent: null,
		attrs: { role: "flashcard" },
		content: text("Q: why?"),
	},
	{
		id: "h2",
		type: "heading",
		parent: null,
		attrs: { level: 3, role: "flashcard" },
		content: text("Card"),
	},
	{
		id: "p2",
		type: "paragraph",
		parent: null,
		attrs: { role: "inbox" },
		content: text("loose"),
	},
	{
		id: "c",
		type: "callout",
		parent: null,
		attrs: { role: "flashcard" },
	},
	{ id: "cp", type: "paragraph", parent: "c", content: text("in callout") },
	{ id: "t", type: "toggle", parent: null, attrs: { role: "flashcard" } },
	{ id: "tp", type: "paragraph", parent: "t", content: text("summary") },
	{ id: "ul", type: "bulletList", parent: null },
	{ id: "li", type: "listItem", parent: "ul", attrs: { role: "flashcard" } },
	{ id: "lip", type: "paragraph", parent: "li", content: text("item") },
];

describe("block role", () => {
	it("round-trips every role on heading, paragraph, callout, toggle and list item", () => {
		expect(checkBlocks(BLOCKS)).toEqual({ ok: true });
		expect(docToBlocks(blocksToDoc(BLOCKS))).toEqual(BLOCKS);
	});

	it("keeps the role through the live editor and an edit", () => {
		const { editor } = open(BLOCKS);
		editor.commands.insertContentAt(editor.state.doc.content.size - 1, "x");
		const saved = docToBlocks(editor.getJSON());
		for (const block of BLOCKS) {
			const after = saved.find((b) => b.id === block.id);
			expect(after?.attrs).toEqual(block.attrs);
		}
	});

	it("never writes a role key for blocks without one", () => {
		const plain: Block[] = [
			{
				id: "h",
				type: "heading",
				parent: null,
				attrs: { level: 2 },
				content: text("a"),
			},
			{ id: "p", type: "paragraph", parent: null, content: text("b") },
		];
		const saved = docToBlocks(blocksToDoc(plain));
		expect(saved).toEqual(plain);
		expect(JSON.stringify(saved)).not.toContain("role");
		const { editor } = open(plain);
		expect(JSON.stringify(docToBlocks(editor.getJSON()))).not.toContain("role");
	});

	it("keeps a role this version does not know, and the note stays editable", () => {
		const blocks: Block[] = [
			{
				id: "p",
				type: "paragraph",
				parent: null,
				attrs: { role: "quiz" },
				content: text("from a newer app"),
			},
		];
		expect(checkBlocks(blocks)).toEqual({ ok: true });
		expect(docToBlocks(blocksToDoc(blocks))).toEqual(blocks);
		const { root } = open(blocks);
		expect(root.querySelector("[data-role]")).toBeNull();
		expect(knownRole("quiz")).toBeUndefined();
	});

	it("marks only known roles with data-role on the rendered node", async () => {
		const { root } = open(BLOCKS);
		expect(root.querySelector('h2[data-role="inbox"]')).not.toBeNull();
		expect(root.querySelector('p[data-role="flashcard"]')).not.toBeNull();
		expect(root.querySelector('li[data-role="flashcard"]')).not.toBeNull();
		await waitFor(() => {
			expect(
				root.querySelector('.callout[data-role="flashcard"]'),
			).not.toBeNull();
			expect(
				root.querySelector('.toggle[data-role="flashcard"]'),
			).not.toBeNull();
		});
	});
});
