// @vitest-environment happy-dom

import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { getSchema, type JSONContent } from "@tiptap/core";
import { afterEach, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BLOCK_DRAG_TYPE, setBlockDragData } from "./block-drag";
import { BLOCK_TYPES } from "./blocks";
import { createExtensions } from "./extensions";
import { NoteEditor } from "./NoteEditor";

const schema = getSchema(createExtensions());
const paragraph = (id: string, text: string): JSONContent => ({
	type: "paragraph",
	attrs: { id },
	content: [{ type: "text", text }],
});
const blocks: Record<(typeof BLOCK_TYPES)[number], JSONContent> = {
	paragraph: paragraph("p", "Paragraph"),
	heading: {
		type: "heading",
		attrs: { id: "h", level: 1 },
		content: [{ type: "text", text: "Heading" }],
	},
	bulletList: {
		type: "bulletList",
		attrs: { id: "ul" },
		content: [
			{
				type: "listItem",
				attrs: { id: "li" },
				content: [paragraph("lip", "Bullet")],
			},
			{
				type: "listItem",
				attrs: { id: "li2" },
				content: [paragraph("lip2", "Second bullet")],
			},
		],
	},
	orderedList: {
		type: "orderedList",
		attrs: { id: "ol" },
		content: [
			{
				type: "listItem",
				attrs: { id: "oli" },
				content: [paragraph("olip", "Numbered")],
			},
		],
	},
	listItem: {
		type: "listItem",
		attrs: { id: "li" },
		content: [paragraph("lip", "Item")],
	},
	taskBlock: {
		type: "taskBlock",
		attrs: { id: "task" },
		content: [{ type: "text", text: "Task" }],
	},
	codeBlock: {
		type: "codeBlock",
		attrs: { id: "code" },
		content: [{ type: "text", text: "Code" }],
	},
	blockquote: {
		type: "blockquote",
		attrs: { id: "quote" },
		content: [paragraph("qp", "Quote")],
	},
};

afterEach(() => cleanup());

it.each(BLOCK_TYPES)(
	"prepares a drag for %s with only identifiers and a readable first line",
	(type) => {
		const node = schema.nodeFromJSON(blocks[type]);
		const transfer = new DataTransfer();
		const firstLine = setBlockDragData(transfer, "note-1", node);
		expect(firstLine).toBe(transfer.getData("text/plain"));
		expect(firstLine).toBeTruthy();
		expect(JSON.parse(transfer.getData(BLOCK_DRAG_TYPE))).toEqual({
			noteId: "note-1",
			blockId: node.attrs.id,
		});
		expect(transfer.types).toHaveLength(2);
	},
);

it("uses only the first list item's line for a list preview", () => {
	const transfer = new DataTransfer();
	const node = schema.nodeFromJSON(blocks.bulletList);
	expect(setBlockDragData(transfer, "note-1", node)).toBe("Bullet");
});

it.each(BLOCK_TYPES)("renders the grip for %s", async (type) => {
	// A list item is selected through its top-level list wrapper.
	const root = type === "listItem" ? blocks.bulletList : blocks[type];
	render(
		<TooltipProvider>
			<NoteEditor
				doc={{ type: "doc", content: [root] }}
				noteId="note-1"
				onChange={() => {}}
			/>
		</TooltipProvider>,
	);
	await waitFor(() =>
		expect(document.querySelector(".block-drag-handle button")).not.toBeNull(),
	);
});

it("does not render the grip for a read-only note", () => {
	render(
		<TooltipProvider>
			<NoteEditor
				doc={{ type: "doc", content: [paragraph("p", "Hello")] }}
				noteId="note-1"
				editable={false}
				onChange={() => {}}
			/>
		</TooltipProvider>,
	);
	expect(document.querySelector(".block-drag-handle button")).toBeNull();
});

it("does not change a same-note document when the custom payload is dropped inside", () => {
	const onChange = vi.fn();
	const doc: JSONContent = {
		type: "doc",
		content: [paragraph("one", "First"), paragraph("two", "Second")],
	};
	const { container } = render(
		<TooltipProvider>
			<NoteEditor doc={doc} noteId="note-1" onChange={onChange} />
		</TooltipProvider>,
	);
	const editor = container.querySelector(".ProseMirror");
	expect(editor).not.toBeNull();
	const transfer = {
		getData: (type: string) =>
			type === BLOCK_DRAG_TYPE
				? JSON.stringify({ noteId: "note-1", blockId: "one" })
				: "",
		types: [BLOCK_DRAG_TYPE],
	};
	fireEvent.drop(editor as Element, { dataTransfer: transfer });
	expect(onChange).not.toHaveBeenCalled();
	expect(
		Array.from(editor?.querySelectorAll("[data-id]") ?? []).map((element) =>
			element.getAttribute("data-id"),
		),
	).toEqual(["one", "two"]);
	expect(() => schema.nodeFromJSON(doc).check()).not.toThrow();
});
