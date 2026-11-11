// @vitest-environment happy-dom
import { getSchema, type JSONContent } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { EditorState, NodeSelection } from "@tiptap/pm/state";
import { dropPoint } from "@tiptap/pm/transform";
import { describe, expect, it } from "vitest";
import { blockDragData, blockDragNote, setBlockDragData } from "./block-drag";
import { blocksToDoc, checkBlocks, docToBlocks } from "./doc-blocks";
import { createExtensions } from "./extensions";

const schema = getSchema(createExtensions());

const item = (id: string, words: string, ...nested: JSONContent[]) => ({
	type: "listItem",
	attrs: { id },
	content: [
		{
			type: "paragraph",
			attrs: { id: `${id}-p` },
			content: [{ type: "text", text: words }],
		},
		...nested,
	],
});
const list = (kind: string, id: string, ...items: JSONContent[]) => ({
	type: kind,
	attrs: { id },
	content: items,
});

/** Where the node with this id starts. */
function posOf(doc: PMNode, id: string): number {
	let at = -1;
	doc.descendants((node, pos) => {
		if (node.attrs.id === id) at = pos;
		return at < 0;
	});
	if (at < 0) throw new Error(`no ${id}`);
	return at;
}

/**
 * Drag the list item `id` and drop it just before the node `before`, the way
 * the editor's own drop handler does it: take the item out, then put it where
 * it fits nearest the drop point.
 */
function drag(doc: PMNode, id: string, before: string): PMNode {
	const state = EditorState.create({ doc });
	const selection = NodeSelection.create(doc, posOf(doc, id));
	const slice = selection.content();
	const target =
		dropPoint(doc, posOf(doc, before), slice) ?? posOf(doc, before);
	const tr = state.tr.setSelection(selection).deleteSelection();
	const pos = tr.mapping.map(target);
	tr.replaceRangeWith(pos, pos, slice.content.firstChild as PMNode);
	return tr.doc;
}

/** Each list as its kind and its items' first lines, nested lists inside. */
type Outline = (string | Outline)[];
function outline(node: PMNode): Outline {
	const out: Outline = [];
	node.forEach((child) => {
		if (child.type.name === "listItem") {
			out.push(child.firstChild?.textContent ?? "");
			child.forEach((inner, _, index) => {
				if (index > 0) out.push([inner.type.name, ...outline(inner)]);
			});
		} else out.push([child.type.name, ...outline(child)]);
	});
	return out;
}

describe("dragging list items", () => {
	const start = schema.nodeFromJSON({
		type: "doc",
		content: [
			list(
				"orderedList",
				"ol",
				item(
					"a",
					"urban centers",
					list("bulletList", "ul", item("b", "dense")),
				),
				item("c", "organized labor"),
			),
		],
	});

	it("turns a bullet dragged out of its item into a numbered item, leaving no empty list", () => {
		const after = drag(start, "b", "c");
		expect(outline(after)).toEqual([
			["orderedList", "urban centers", "dense", "organized labor"],
		]);
		const blocks = docToBlocks(after.toJSON());
		expect(checkBlocks(blocks)).toEqual({ ok: true });
		expect(outline(schema.nodeFromJSON(blocksToDoc(blocks)))).toEqual(
			outline(after),
		);
	});

	it("moves a numbered item, children and all, to another place in the list", () => {
		const after = drag(start, "c", "a");
		expect(outline(after)).toEqual([
			[
				"orderedList",
				"organized labor",
				"urban centers",
				["bulletList", "dense"],
			],
		]);
	});

	it("keeps a list item drag inside its own note", () => {
		const data = new Map<string, string>();
		const types: string[] = [];
		const transfer = {
			types,
			setData: (type: string, value: string) => {
				data.set(type, value);
				types.push(type);
			},
			getData: (type: string) => data.get(type) ?? "",
			effectAllowed: "none",
		} as unknown as DataTransfer;
		const node = start.nodeAt(posOf(start, "b")) as PMNode;
		expect(setBlockDragData(transfer, "note-1", node)).toBe("dense");
		expect(blockDragNote(transfer)).toBe("note-1");
		expect(blockDragData(transfer)).toBeNull();
	});
});
