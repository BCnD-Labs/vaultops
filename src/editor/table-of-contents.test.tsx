// @vitest-environment happy-dom

import { cleanup, render } from "@testing-library/react";
import type { JSONContent } from "@tiptap/core";
import { type Editor, EditorContent, useEditor } from "@tiptap/react";
import { afterEach, expect, it, vi } from "vitest";
import { type Note, parseNote, serializeNote } from "../core/note-format";
import { tocList } from "../core/notes/toc";
import { notify } from "../ui/notify";
import { blocksToDoc, checkBlocks, docToBlocks } from "./doc-blocks";
import { createExtensions } from "./extensions";
import { insertTableOfContents } from "./table-of-contents";

vi.mock("../ui/notify", () => ({ notify: vi.fn() }));

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
	vi.clearAllMocks();
});

const heading = (level: number, text: string) => ({
	type: "heading",
	attrs: { id: crypto.randomUUID(), level },
	content: text ? [{ type: "text", text }] : undefined,
});

/** A note with these top-level blocks and "/toc" typed as the last paragraph. */
function noteWith(...before: object[]) {
	return {
		type: "doc",
		content: [
			...before,
			{
				type: "paragraph",
				attrs: { id: crypto.randomUUID() },
				content: [{ type: "text", text: "/toc" }],
			},
		],
	};
}

/** The range of the typed "/toc" at the end of the note. */
function slashRange(editor: Editor) {
	const to = editor.state.doc.content.size - 1;
	return { from: to - "/toc".length, to };
}

/**
 * The JSON with the editor's ids and empty (null) attributes left out, so only
 * the shape and the text are compared.
 */
function withoutIds(node: JSONContent): JSONContent {
	const attrs = Object.fromEntries(
		Object.entries(node.attrs ?? {}).filter(
			([name, value]) => name !== "id" && value !== null,
		),
	);
	return {
		...node,
		...(Object.keys(attrs).length ? { attrs } : { attrs: undefined }),
		...(node.content ? { content: node.content.map(withoutIds) } : {}),
	};
}

const sample = [
	heading(1, "Intro"),
	heading(2, "Setup"),
	heading(3, "Install"),
	heading(1, "End"),
];

it("puts an ordinary nested list where the command was typed", () => {
	const editor = open(noteWith(...sample));
	expect(insertTableOfContents(editor, slashRange(editor))).toBe(true);

	const top = editor.getJSON().content ?? [];
	expect(top.map((node) => node.type)).toEqual([
		"heading",
		"heading",
		"heading",
		"heading",
		"bulletList",
	]);
	expect(withoutIds(top[4] as JSONContent)).toEqual(
		tocList([
			{ id: null, level: 1, text: "Intro" },
			{ id: null, level: 2, text: "Setup" },
			{ id: null, level: 3, text: "Install" },
			{ id: null, level: 1, text: "End" },
		]),
	);
	expect(editor.getText()).not.toContain("/toc");
});

it("saves the list as ordinary blocks that read back unchanged", () => {
	const editor = open(noteWith(...sample));
	insertTableOfContents(editor, slashRange(editor));

	const blocks = docToBlocks(editor.getJSON());
	expect(checkBlocks(blocks)).toEqual({ ok: true });
	expect(blocks.every((block) => typeof block.id === "string")).toBe(true);

	const note: Note = {
		header: { format: "vaultops-note", v: 1, noteId: "n1" },
		blocks,
	};
	const parsed = parseNote(serializeNote(note));
	expect(parsed.problems).toEqual([]);
	expect(parsed.note?.blocks).toEqual(blocks);
	expect(docToBlocks(blocksToDoc(parsed.note?.blocks ?? []))).toEqual(blocks);
});

it("tells the person there are no headings yet and inserts nothing", () => {
	const editor = open(
		noteWith(heading(1, ""), {
			type: "paragraph",
			attrs: { id: crypto.randomUUID() },
			content: [{ type: "text", text: "Just words" }],
		}),
	);
	const before = editor.getJSON();

	expect(insertTableOfContents(editor, slashRange(editor))).toBe(false);
	expect(notify).toHaveBeenCalledWith(
		"No headings yet",
		expect.objectContaining({ description: expect.any(String) }),
	);
	expect(editor.getJSON()).toEqual(before);
});
