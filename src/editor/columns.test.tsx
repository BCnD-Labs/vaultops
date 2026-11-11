// @vitest-environment happy-dom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Editor, getSchema, type JSONContent } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";
import { type Block, parseNote, serializeNote } from "../core/note-format";
import {
	COLUMN_DRAG_RULES,
	canInsertColumns,
	hasColumns,
	insertColumns,
} from "./columns";
import { blocksToDoc, checkBlocks, docToBlocks } from "./doc-blocks";
import { createExtensions } from "./extensions";
import { findMovable, moveOut } from "./move-out";

const schema = getSchema(createExtensions());
let editor: Editor | null = null;
afterEach(() => editor?.destroy());

const p = (id: string, text?: string): JSONContent => ({
	type: "paragraph",
	attrs: { id },
	...(text ? { content: [{ type: "text", text }] } : {}),
});
const column = (id: string, ...content: JSONContent[]): JSONContent => ({
	type: "column",
	attrs: { id },
	content,
});
const columns = (id: string, ...cols: JSONContent[]): JSONContent => ({
	type: "columns",
	attrs: { id },
	content: cols,
});
const json = (e: Editor) => e.getJSON() as JSONContent;
/** A real Backspace key press, as the editor's key handlers see it. */
const backspace = (e: Editor) =>
	e.view.someProp("handleKeyDown", (handle) =>
		handle(e.view, new KeyboardEvent("keydown", { key: "Backspace" })),
	);
const make = (content: JSONContent[]) => {
	editor = new Editor({
		extensions: createExtensions(),
		content: { type: "doc", content },
	});
	return editor;
};
const valid = (node: JSONContent) => {
	try {
		schema.nodeFromJSON({ type: "doc", content: [node] }).check();
		return true;
	} catch {
		return false;
	}
};
const posOf = (e: Editor, id: string) => {
	let found = -1;
	e.state.doc.descendants((node, pos) => {
		if (node.attrs.id === id) found = pos;
	});
	return found;
};
const shape = (e: Editor) =>
	e
		.getJSON()
		.content?.map((n) => `${n.type}:${n.attrs?.id ?? ""}`)
		.join(" ");

describe("the columns schema", () => {
	it("holds two or three columns, and each column at least one block", () => {
		const one = columns("k", column("a", p("ap")));
		const two = columns("k", column("a", p("ap")), column("b", p("bp")));
		const four = columns(
			"k",
			...["a", "b", "c", "d"].map((id) => column(id, p(`${id}p`))),
		);
		expect(valid(one)).toBe(false);
		expect(valid(two)).toBe(true);
		expect(valid(four)).toBe(false);
		expect(valid(columns("k", column("a"), column("b", p("bp"))))).toBe(false);
	});

	it("allows a layout only on the note's own level: no nesting, not in other blocks", () => {
		const inner = () =>
			columns("in", column("ia", p("iap")), column("ib", p("ibp")));
		expect(
			valid(columns("k", column("a", inner()), column("b", p("bp")))),
		).toBe(false);
		for (const holder of [
			{ type: "toggle", content: [p("s"), inner()] },
			{ type: "callout", content: [inner()] },
			{ type: "blockquote", content: [inner()] },
		])
			expect(valid(holder)).toBe(false);
		expect(valid(inner())).toBe(true);
		// A column is not a block of its own.
		expect(valid(column("lone", p("lp")))).toBe(false);
	});
});

describe("inserting a layout", () => {
	it("replaces an empty line, with the cursor in the first column", () => {
		const e = make([p("a", "Before"), p("slash", "/")]);
		const from = posOf(e, "slash") + 1;
		expect(insertColumns(e, { from, to: from + 1 }, 2)).toBe(true);
		const doc = json(e).content ?? [];
		expect(doc.map((n) => n.type)).toEqual(["paragraph", "columns"]);
		const layout = doc[1];
		expect(layout?.content?.map((c) => c.type)).toEqual(["column", "column"]);
		for (const col of layout?.content ?? []) {
			expect(col.content).toHaveLength(1);
			expect(col.content?.[0]?.type).toBe("paragraph");
			expect(col.content?.[0]?.content).toBeUndefined();
		}
		const { $from } = e.state.selection;
		expect($from.node(2).type.name).toBe("column");
		expect($from.index(1)).toBe(0);
		expect($from.parent.type.name).toBe("paragraph");
		expect($from.parentOffset).toBe(0);
	});

	it("goes after a line that has other text, and makes three columns", () => {
		const e = make([p("a", "Keep this /")]);
		const from = 1 + "Keep this ".length;
		expect(insertColumns(e, { from, to: from + 1 }, 3)).toBe(true);
		const doc = json(e).content ?? [];
		expect(doc.map((n) => n.type)).toEqual(["paragraph", "columns"]);
		expect(doc[0]?.content?.[0]?.text).toBe("Keep this ");
		expect(doc[1]?.content).toHaveLength(3);
	});

	it("gives the layout and its columns ids, and saves them as lines", () => {
		const e = make([p("slash", "/")]);
		insertColumns(e, { from: 1, to: 2 }, 2);
		const lines = docToBlocks(json(e));
		expect(lines.map((l) => l.type)).toEqual([
			"columns",
			"column",
			"paragraph",
			"column",
			"paragraph",
		]);
		expect(lines.map((l) => typeof l.id)).toEqual(Array(5).fill("string"));
		expect(lines[1]?.parent).toBe(lines[0]?.id);
		expect(lines[2]?.parent).toBe(lines[1]?.id);
		expect(lines[3]?.parent).toBe(lines[0]?.id);
		expect(lines[0]?.attrs).toBeUndefined();
		expect(checkBlocks(lines)).toEqual({ ok: true });
	});

	it("does nothing inside another block, or for a count of one or four", () => {
		const e = make([
			{
				type: "toggle",
				attrs: { id: "t", open: true },
				content: [p("s"), p("b", "/")],
			},
		]);
		const from = posOf(e, "b") + 1;
		e.commands.setTextSelection(from + 1);
		expect(canInsertColumns(e)).toBe(false);
		const before = JSON.stringify(json(e));
		expect(insertColumns(e, { from, to: from + 1 }, 2)).toBe(false);
		expect(JSON.stringify(json(e))).toBe(before);

		const root = make([p("r", "/")]);
		root.commands.setTextSelection(2);
		expect(canInsertColumns(root)).toBe(true);
		expect(insertColumns(root, { from: 1, to: 2 }, 1)).toBe(false);
		expect(insertColumns(root, { from: 1, to: 2 }, 4)).toBe(false);
		expect(shape(root)).toBe("paragraph:r");
	});
});

describe("keys", () => {
	it("Backspace at the start of an empty layout removes it, leaving one empty line", () => {
		const e = make([
			p("a", "Before"),
			columns("k", column("c1", p("p1")), column("c2", p("p2"))),
			p("z", "After"),
		]);
		e.commands.setTextSelection(posOf(e, "p1") + 1);
		backspace(e);
		const doc = json(e).content ?? [];
		expect(doc.map((n) => n.type)).toEqual([
			"paragraph",
			"paragraph",
			"paragraph",
		]);
		expect(doc[1]?.content).toBeUndefined();
		expect(e.state.selection.$from.index(0)).toBe(1);
		expect(e.state.selection.$from.parent.type.name).toBe("paragraph");
	});

	it("keeps a layout that has anything in it", () => {
		for (const content of [
			[column("c1", p("p1", "x")), column("c2", p("p2"))],
			[column("c1", p("p1"), p("p1b")), column("c2", p("p2"))],
			[column("c1", p("p1")), column("c2", p("p2", "y"))],
		]) {
			const e = make([columns("k", ...content)]);
			const before = JSON.stringify(json(e));
			e.commands.setTextSelection(posOf(e, "p1") + 1);
			backspace(e);
			expect(JSON.stringify(json(e))).toBe(before);
			e.destroy();
		}
	});

	it("does not remove a layout from the start of its second column", () => {
		const e = make([
			columns("k", column("c1", p("p1")), column("c2", p("p2"))),
		]);
		const before = JSON.stringify(json(e));
		e.commands.setTextSelection(posOf(e, "p2") + 1);
		backspace(e);
		expect(JSON.stringify(json(e))).toBe(before);
	});

	it("never joins text across the edge of a column", () => {
		const e = make([
			columns(
				"k",
				column("c1", p("p1", "Left")),
				column("c2", p("p2", "Right")),
			),
		]);
		e.commands.setTextSelection(posOf(e, "p2") + 1);
		backspace(e);
		const cols = json(e).content?.[0]?.content ?? [];
		expect(cols.map((c) => c.content?.[0]?.content?.[0]?.text)).toEqual([
			"Left",
			"Right",
		]);
	});
});

describe("blocks in a column", () => {
	const layout = () =>
		make([
			p("a", "Above"),
			columns(
				"k",
				column("c1", p("p1", "One"), p("p1b", "One b")),
				column("c2", p("p2", "Two"), {
					type: "callout",
					attrs: { id: "co", tone: "note" },
					content: [p("cp1", "In a callout"), p("cp2", "Second")],
				}),
			),
			p("z", "Below"),
		]);

	it("offers Move out for a block directly in a column, and puts it below the layout", () => {
		const e = layout();
		const found = findMovable(e.state.doc, posOf(e, "p1b") + 1);
		expect(found?.from).toBe("column");
		expect(found?.pos).toBe(posOf(e, "p1b"));
		expect(moveOut(e, posOf(e, "p1b"))).toBe(true);
		expect(shape(e)).toBe("paragraph:a columns:k paragraph:p1b paragraph:z");
		const first = json(e).content?.[1]?.content?.[0]?.content;
		expect(first?.map((n) => n.attrs?.id)).toEqual(["p1"]);
	});

	it("moves a block nested inside a block in a column to below the whole layout", () => {
		const e = layout();
		const found = findMovable(e.state.doc, posOf(e, "cp2") + 1);
		expect(found?.from).toBe("callout");
		expect(moveOut(e, posOf(e, "cp2"))).toBe(true);
		expect(shape(e)).toBe("paragraph:a columns:k paragraph:cp2 paragraph:z");
		const second = json(e).content?.[1]?.content?.[1]?.content;
		expect(second?.map((n) => n.attrs?.id)).toEqual(["p2", "co"]);
	});

	it("leaves the only block in a column where it is, so no column is ever empty", () => {
		const e = make([
			columns("k", column("c1", p("p1", "Only")), column("c2", p("p2", "Two"))),
		]);
		expect(findMovable(e.state.doc, posOf(e, "p1") + 1)).toBeNull();
	});

	it("keeps a column filled when its only block is dragged away", () => {
		const e = make([
			columns("k", column("c1", p("p1", "Only")), column("c2", p("p2", "Two"))),
			p("z", "After"),
		]);
		const from = posOf(e, "p1");
		e.view.dispatch(e.state.tr.delete(from, from + 3 + 1));
		const cols = json(e).content?.[0]?.content ?? [];
		expect(cols).toHaveLength(2);
		expect(cols[0]?.content?.[0]?.type).toBe("paragraph");
	});
});

describe("the drag handle rules", () => {
	const score = (node: JSONContent, parent: JSONContent | null): number => {
		const doc = schema.nodeFromJSON({
			type: "doc",
			content: [
				columns("k", column("c1", p("p1")), column("c2", p("p2"))),
				p("root"),
				{
					type: "bulletList",
					attrs: { id: "ul" },
					content: [
						{ type: "listItem", attrs: { id: "li" }, content: [p("lip")] },
					],
				},
			],
		});
		const find = (id: string) => {
			let found: ReturnType<typeof doc.nodeAt> = null;
			doc.descendants((n) => {
				if (n.attrs.id === id) found = n;
			});
			return found;
		};
		const n = find(node.attrs?.id as string);
		const holder =
			parent === null
				? null
				: parent.type === "doc"
					? doc
					: find(parent.attrs?.id as string);
		if (!n) throw new Error("missing node");
		return (
			COLUMN_DRAG_RULES[0] as (typeof COLUMN_DRAG_RULES)[number]
		).evaluate({
			node: n,
			parent: holder,
		});
	};
	const ref = (type: string, id: string): JSONContent => ({
		type,
		attrs: { id },
	});

	it("rules out the layout and its columns, so they cannot be dragged", () => {
		expect(score(ref("columns", "k"), ref("doc", ""))).toBe(1000);
		expect(score(ref("column", "c1"), ref("columns", "k"))).toBe(1000);
	});

	it("keeps the blocks of the note and the blocks directly in a column", () => {
		expect(score(ref("paragraph", "root"), ref("doc", ""))).toBe(0);
		expect(score(ref("bulletList", "ul"), ref("doc", ""))).toBe(0);
		expect(score(ref("paragraph", "p1"), ref("column", "c1"))).toBe(0);
	});

	it("keeps each list item, and rules out what is deeper inside a block", () => {
		expect(score(ref("listItem", "li"), ref("bulletList", "ul"))).toBe(0);
		expect(score(ref("paragraph", "lip"), ref("listItem", "li"))).toBe(1000);
	});
});

describe("hasColumns", () => {
	it("is true only for a layout on the note's own level", () => {
		const yes = schema.nodeFromJSON({
			type: "doc",
			content: [
				p("a"),
				columns("k", column("c1", p("p1")), column("c2", p("p2"))),
			],
		});
		const no = schema.nodeFromJSON({ type: "doc", content: [p("a")] });
		expect(hasColumns(yes)).toBe(true);
		expect(hasColumns(no)).toBe(false);
	});
});

describe("columns fixture", () => {
	const text = readFileSync(
		resolve(process.cwd(), "test-fixtures/columns.vnote"),
		"utf8",
	);

	it("reads, edits as a document, and saves back byte for byte", () => {
		const parsed = parseNote(text);
		expect(parsed.problems).toEqual([]);
		const note = parsed.note;
		if (!note) throw new Error("fixture did not parse");
		expect(checkBlocks(note.blocks)).toEqual({ ok: true });
		const doc = blocksToDoc(note.blocks);
		expect(doc.content?.map((n) => n.type)).toEqual([
			"paragraph",
			"columns",
			"columns",
			"paragraph",
		]);
		expect(doc.content?.[2]?.content).toHaveLength(3);
		expect(serializeNote({ ...note, blocks: docToBlocks(doc) })).toBe(text);
	});

	it("opens read-only when a file nests columns, or has the wrong number of columns", () => {
		const note = parseNote(text).note;
		if (!note) throw new Error("fixture did not parse");
		const blocks = note.blocks;
		const nested: Block[] = [
			...blocks.filter((b) => b.id !== "k3"),
			{ id: "n1", type: "columns", parent: "k1a" },
			{ id: "n1a", type: "column", parent: "n1" },
			{ id: "n1ap", type: "paragraph", parent: "n1a" },
			{ id: "n1b", type: "column", parent: "n1" },
			{ id: "n1bp", type: "paragraph", parent: "n1b" },
		];
		expect(checkBlocks(nested).ok).toBe(false);
		const inToggle: Block[] = [
			{ id: "t", type: "toggle", parent: null },
			{ id: "ts", type: "paragraph", parent: "t" },
			...blocks
				.filter((b) => b.id?.startsWith("k2"))
				.map((b) => (b.id === "k2" ? { ...b, parent: "t" } : b)),
		];
		expect(checkBlocks(inToggle).ok).toBe(false);
		const single = blocks.filter(
			(b) => !["k2b", "k2bp", "k2c", "k2cp"].includes(b.id ?? ""),
		);
		expect(checkBlocks(single).ok).toBe(false);
		const bare: Block[] = [{ id: "c", type: "column", parent: null }];
		expect(checkBlocks(bare).ok).toBe(false);
	});
});
