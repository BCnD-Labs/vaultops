import { readFileSync } from "node:fs";
import type { JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { type Block, parseNote, serializeNote } from "../core/note-format";
import { blocksToDoc, checkBlocks, docToBlocks } from "./doc-blocks";

const text = (value: string, marks?: string[]): JSONContent => ({
	type: "text",
	text: value,
	...(marks ? { marks: marks.map((type) => ({ type })) } : {}),
});

/** One of every block type, nested lists included, in the form the file stores them. */
const FIXTURE: Block[] = [
	{
		id: "h",
		type: "heading",
		parent: null,
		attrs: { level: 2 },
		content: [text("Title")] as never,
	},
	{
		id: "p",
		type: "paragraph",
		parent: null,
		content: [
			text("plain "),
			text("bold", ["bold"]),
			text("italic", ["italic"]),
			text("strike", ["strike"]),
			text("code", ["code"]),
			{ type: "hardBreak" },
			text("after break"),
		] as never,
	},
	{ id: "ul", type: "bulletList", parent: null },
	{ id: "li1", type: "listItem", parent: "ul" },
	{
		id: "li1p",
		type: "paragraph",
		parent: "li1",
		content: [text("one")] as never,
	},
	{ id: "ol", type: "orderedList", parent: "li1", attrs: { start: 3 } },
	{ id: "oli", type: "listItem", parent: "ol" },
	{
		id: "olip",
		type: "paragraph",
		parent: "oli",
		content: [text("nested")] as never,
	},
	{ id: "li2", type: "listItem", parent: "ul" },
	{
		id: "li2p",
		type: "paragraph",
		parent: "li2",
		content: [text("two")] as never,
	},
	{
		id: "t1",
		type: "taskBlock",
		parent: null,
		content: [text("open")] as never,
	},
	{
		id: "t2",
		type: "taskBlock",
		parent: null,
		attrs: { checked: true },
		content: [text("done")] as never,
	},
	{
		id: "c",
		type: "codeBlock",
		parent: null,
		attrs: { language: "ts" },
		content: [text("let x = 1")] as never,
	},
	{ id: "q", type: "blockquote", parent: null },
	{
		id: "qp",
		type: "paragraph",
		parent: "q",
		content: [text("quoted")] as never,
	},
	{ id: "d", type: "divider", parent: null },
	{ id: "co", type: "callout", parent: null },
	{
		id: "cop",
		type: "paragraph",
		parent: "co",
		content: [text("plain note")] as never,
	},
	{ id: "ci", type: "callout", parent: null, attrs: { tone: "warning" } },
	{
		id: "cip",
		type: "paragraph",
		parent: "ci",
		content: [text("careful")] as never,
	},
	{ id: "e", type: "paragraph", parent: null },
];

describe("document and blocks", () => {
	it("maps every block type and nesting both ways, ids unchanged", () => {
		expect(checkBlocks(FIXTURE)).toEqual({ ok: true });
		const doc = blocksToDoc(FIXTURE);
		expect(docToBlocks(doc)).toEqual(FIXTURE);
		expect(blocksToDoc(docToBlocks(doc))).toEqual(doc);
	});

	it("puts children after their parent and points parent at its id", () => {
		const blocks = docToBlocks(blocksToDoc(FIXTURE));
		const ids = blocks.map((b) => b.id);
		expect(ids.indexOf("li1")).toBeLessThan(ids.indexOf("li1p"));
		expect(blocks.find((b) => b.id === "ol")?.parent).toBe("li1");
		expect(blocks.find((b) => b.id === "olip")?.parent).toBe("oli");
	});

	it("maps a 1,000-block document back unchanged", () => {
		const many: Block[] = Array.from({ length: 1000 }, (_, i) => ({
			id: `b${i}`,
			type: i % 3 === 0 ? "heading" : i % 3 === 1 ? "taskBlock" : "paragraph",
			parent: null,
			...(i % 3 === 0 ? { attrs: { level: 2 } } : {}),
			content: [text(`line ${i}`)] as never,
		}));
		const doc = blocksToDoc(many);
		expect(doc.content).toHaveLength(1000);
		expect(docToBlocks(doc)).toEqual(many);
	});

	it("leaves attributes at their defaults out, so unedited notes re-save identically", () => {
		const blocks = docToBlocks({
			type: "doc",
			content: [
				{ type: "heading", attrs: { id: "a", level: 1 }, content: [text("h")] },
				{
					type: "taskBlock",
					attrs: { id: "b", checked: false },
					content: [text("t")],
				},
				{
					type: "codeBlock",
					attrs: { id: "c", language: null },
					content: [text("x")],
				},
				{
					type: "callout",
					attrs: { id: "d", tone: "note", icon: null, color: null },
					content: [{ type: "paragraph", attrs: { id: "e" } }],
				},
				{
					type: "blockquote",
					attrs: { id: "f", color: null },
					content: [{ type: "paragraph", attrs: { id: "g" } }],
				},
			],
		});
		expect(blocks.map((b) => b.attrs)).toEqual([
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
		]);
	});

	it("gives an empty note one empty paragraph to type in", () => {
		expect(blocksToDoc([])).toEqual({
			type: "doc",
			content: [{ type: "paragraph", attrs: {} }],
		});
	});

	it("throws on a block whose parent does not come first", () => {
		expect(() =>
			blocksToDoc([{ id: "x", type: "paragraph", parent: "missing" }]),
		).toThrow();
	});
});

describe("checkBlocks", () => {
	const reason = (blocks: Block[]) => {
		const result = checkBlocks(blocks);
		return result.ok ? null : result.reason;
	};

	it("refuses a block type from a newer app", () => {
		expect(
			reason([{ id: "a", type: "databaseBlock", parent: null }]),
		).toContain("databaseBlock");
	});

	it("refuses an extra field on a known block", () => {
		expect(
			reason([{ id: "a", type: "paragraph", parent: null, due: "2026-11-01" }]),
		).toContain("due");
	});

	it("refuses an attribute the node does not declare", () => {
		expect(
			reason([
				{ id: "a", type: "paragraph", parent: null, attrs: { color: "red" } },
			]),
		).toContain("color");
	});

	it("refuses content on a container and a layout the editor rejects", () => {
		expect(
			reason([
				{ id: "a", type: "bulletList", parent: null, content: [] as never },
			]),
		).toContain("content");
		expect(
			reason([
				{ id: "a", type: "paragraph", parent: null },
				{ id: "b", type: "listItem", parent: "a" },
			]),
		).not.toBeNull();
	});

	it("refuses unknown inline content or marks", () => {
		expect(
			reason([
				{
					id: "a",
					type: "paragraph",
					parent: null,
					content: [{ type: "mystery" }] as never,
				},
			]),
		).not.toBeNull();
		expect(
			reason([
				{
					id: "a",
					type: "paragraph",
					parent: null,
					content: [text("x", ["glitter"])] as never,
				},
			]),
		).not.toBeNull();
	});
});

describe("toggle fixture", () => {
	const text = readFileSync(
		new URL("../../test-fixtures/toggle.vnote", import.meta.url),
		"utf8",
	);

	it("reads, edits as a document, and saves back byte for byte", () => {
		const parsed = parseNote(text);
		expect(parsed.problems).toEqual([]);
		const note = parsed.note;
		if (!note) throw new Error("fixture did not parse");
		expect(checkBlocks(note.blocks)).toEqual({ ok: true });
		const doc = blocksToDoc(note.blocks);
		expect(doc.content?.map((node) => node.type)).toEqual([
			"paragraph",
			"toggle",
			"toggle",
		]);
		expect(serializeNote({ ...note, blocks: docToBlocks(doc) })).toBe(text);
	});

	it("refuses a toggle that does not start with a summary paragraph", () => {
		const result = checkBlocks([
			{ id: "t", type: "toggle", parent: null },
			{ id: "l", type: "bulletList", parent: "t" },
			{ id: "i", type: "listItem", parent: "l" },
			{ id: "p", type: "paragraph", parent: "i" },
		]);
		expect(result.ok).toBe(false);
	});

	it("refuses an attribute the toggle does not declare", () => {
		const result = checkBlocks([
			{ id: "t", type: "toggle", parent: null, attrs: { color: "red" } },
			{ id: "p", type: "paragraph", parent: "t" },
		]);
		expect(result).toEqual({
			ok: false,
			reason: 'an unknown attribute "color" on a toggle',
		});
	});
});

describe("switch fixture", () => {
	const text = readFileSync(
		new URL("../../test-fixtures/switch.vnote", import.meta.url),
		"utf8",
	);

	it("reads, edits as a document, and saves back byte for byte", () => {
		const parsed = parseNote(text);
		expect(parsed.problems).toEqual([]);
		const note = parsed.note;
		if (!note) throw new Error("fixture did not parse");
		expect(checkBlocks(note.blocks)).toEqual({ ok: true });
		const doc = blocksToDoc(note.blocks);
		expect(doc.content?.map((node) => node.type)).toEqual([
			"paragraph",
			"switch",
			"switch",
		]);
		expect(serializeNote({ ...note, blocks: docToBlocks(doc) })).toBe(text);
	});

	it("refuses an attribute the switch does not declare", () => {
		expect(
			checkBlocks([
				{ id: "s", type: "switch", parent: null, attrs: { color: "red" } },
				{ id: "p", type: "paragraph", parent: "s" },
			]),
		).toEqual({
			ok: false,
			reason: 'an unknown attribute "color" on a switch',
		});
	});
});

describe("divider and callout fixture", () => {
	const text = readFileSync(
		new URL("../../test-fixtures/callout-divider.vnote", import.meta.url),
		"utf8",
	);

	it("reads, edits as a document, and saves back byte for byte", () => {
		const parsed = parseNote(text);
		expect(parsed.problems).toEqual([]);
		const note = parsed.note;
		if (!note) throw new Error("fixture did not parse");
		expect(checkBlocks(note.blocks)).toEqual({ ok: true });
		const doc = blocksToDoc(note.blocks);
		expect(doc.content?.map((node) => node.type)).toEqual([
			"paragraph",
			"divider",
			"callout",
			"callout",
		]);
		expect(serializeNote({ ...note, blocks: docToBlocks(doc) })).toBe(text);
	});
});

describe("callout styles fixture", () => {
	const text = readFileSync(
		new URL("../../test-fixtures/callout-styles.vnote", import.meta.url),
		"utf8",
	);

	it("keeps a callout's custom icon and colour and saves back byte for byte", () => {
		const parsed = parseNote(text);
		expect(parsed.problems).toEqual([]);
		const note = parsed.note;
		if (!note) throw new Error("fixture did not parse");
		expect(checkBlocks(note.blocks)).toEqual({ ok: true });
		const doc = blocksToDoc(note.blocks);
		expect(
			doc.content?.map((node) => ({
				icon: node.attrs?.icon ?? null,
				color: node.attrs?.color ?? null,
			})),
		).toEqual([
			{ icon: null, color: null },
			{ icon: "flame", color: "purple" },
		]);
		expect(serializeNote({ ...note, blocks: docToBlocks(doc) })).toBe(text);
	});
});

describe("table fixture", () => {
	const text = readFileSync(
		new URL("../../test-fixtures/table.vnote", import.meta.url),
		"utf8",
	);

	it("reads, edits as a document, and saves back byte for byte", () => {
		const parsed = parseNote(text);
		expect(parsed.problems).toEqual([]);
		const note = parsed.note;
		if (!note) throw new Error("fixture did not parse");
		expect(checkBlocks(note.blocks)).toEqual({ ok: true });
		const doc = blocksToDoc(note.blocks);
		expect(doc.content?.map((node) => node.type)).toEqual([
			"paragraph",
			"table",
			"paragraph",
		]);
		expect(serializeNote({ ...note, blocks: docToBlocks(doc) })).toBe(text);
	});

	it("refuses a cell outside a row", () => {
		const result = checkBlocks([
			{ id: "t", type: "table", parent: null },
			{ id: "c", type: "tableCell", parent: "t" },
			{ id: "p", type: "paragraph", parent: "c" },
		]);
		expect(result.ok).toBe(false);
	});
});

describe("divider styles fixture", () => {
	const text = readFileSync(
		new URL("../../test-fixtures/divider-styles.vnote", import.meta.url),
		"utf8",
	);

	it("keeps each divider's style and saves back byte for byte", () => {
		const parsed = parseNote(text);
		expect(parsed.problems).toEqual([]);
		const note = parsed.note;
		if (!note) throw new Error("fixture did not parse");
		expect(checkBlocks(note.blocks)).toEqual({ ok: true });
		const doc = blocksToDoc(note.blocks);
		expect(
			doc.content?.slice(1).map((node) => node.attrs?.style ?? null),
		).toEqual([null, "dashed", "dotted", "thick"]);
		expect(serializeNote({ ...note, blocks: docToBlocks(doc) })).toBe(text);
	});
});

describe("blockquote colors fixture", () => {
	const text = readFileSync(
		new URL("../../test-fixtures/blockquote-colors.vnote", import.meta.url),
		"utf8",
	);

	it("keeps each quote's bar colour and saves back byte for byte", () => {
		const parsed = parseNote(text);
		expect(parsed.problems).toEqual([]);
		const note = parsed.note;
		if (!note) throw new Error("fixture did not parse");
		expect(checkBlocks(note.blocks)).toEqual({ ok: true });
		const doc = blocksToDoc(note.blocks);
		expect(
			doc.content?.slice(1).map((node) => node.attrs?.color ?? null),
		).toEqual([null, "blue"]);
		expect(serializeNote({ ...note, blocks: docToBlocks(doc) })).toBe(text);
	});
});

describe("inline and code fixture", () => {
	const text = readFileSync(
		new URL("../../test-fixtures/inline-and-code.vnote", import.meta.url),
		"utf8",
	);

	it("keeps the kbd mark, the date chip and the code language byte for byte", () => {
		const parsed = parseNote(text);
		expect(parsed.problems).toEqual([]);
		const note = parsed.note;
		if (!note) throw new Error("fixture did not parse");
		expect(checkBlocks(note.blocks)).toEqual({ ok: true });
		const doc = blocksToDoc(note.blocks);
		expect(serializeNote({ ...note, blocks: docToBlocks(doc) })).toBe(text);
	});
});

describe("code block display fixture", () => {
	const text = readFileSync(
		new URL("../../test-fixtures/code-block-display.vnote", import.meta.url),
		"utf8",
	);

	it("keeps wrap and highlighted lines, and leaves untouched blocks as they were, byte for byte", () => {
		const parsed = parseNote(text);
		expect(parsed.problems).toEqual([]);
		const note = parsed.note;
		if (!note) throw new Error("fixture did not parse");
		expect(checkBlocks(note.blocks)).toEqual({ ok: true });
		const doc = blocksToDoc(note.blocks);
		expect(doc.content?.map((node) => node.attrs?.wrap)).toEqual([
			true,
			undefined,
			undefined,
			true,
		]);
		// Highlighted lines are kept as written, and so is a value that is not lines.
		expect(doc.content?.map((node) => node.attrs?.highlight)).toEqual([
			undefined,
			undefined,
			"2,4-5",
			"not lines",
		]);
		expect(serializeNote({ ...note, blocks: docToBlocks(doc) })).toBe(text);
	});
});

describe("math block fixture", () => {
	const text = readFileSync(
		new URL("../../test-fixtures/math-block.vnote", import.meta.url),
		"utf8",
	);

	it("keeps the LaTeX, with its backslashes and quotes, byte for byte, and an empty block as it was", () => {
		const parsed = parseNote(text);
		expect(parsed.problems).toEqual([]);
		const note = parsed.note;
		if (!note) throw new Error("fixture did not parse");
		expect(checkBlocks(note.blocks)).toEqual({ ok: true });
		const doc = blocksToDoc(note.blocks);
		expect(doc.content?.map((node) => node.attrs?.latex)).toEqual([
			"\\frac{a}{b}=\\sqrt{x^2+1}",
			'\\text{say "hi"}\\quad\\alpha+\\beta',
			undefined,
			undefined,
		]);
		expect(serializeNote({ ...note, blocks: docToBlocks(doc) })).toBe(text);
	});
});

describe("note links fixture", () => {
	const text = readFileSync(
		new URL("../../test-fixtures/note-links.vnote", import.meta.url),
		"utf8",
	);

	it("reads, and saves back byte for byte", () => {
		const parsed = parseNote(text);
		expect(parsed.problems).toEqual([]);
		const note = parsed.note;
		if (!note) throw new Error("fixture did not parse");
		expect(checkBlocks(note.blocks)).toEqual({ ok: true });
		const doc = blocksToDoc(note.blocks);
		expect(serializeNote({ ...note, blocks: docToBlocks(doc) })).toBe(text);
	});
});

describe("toggle heading fixture", () => {
	const text = readFileSync(
		new URL("../../test-fixtures/toggle-heading.vnote", import.meta.url),
		"utf8",
	);

	it("reads, edits as a document, and saves back byte for byte", () => {
		const parsed = parseNote(text);
		expect(parsed.problems).toEqual([]);
		const note = parsed.note;
		if (!note) throw new Error("fixture did not parse");
		expect(checkBlocks(note.blocks)).toEqual({ ok: true });
		const doc = blocksToDoc(note.blocks);
		expect(doc.content?.map((node) => node.type)).toEqual([
			"paragraph",
			"toggle",
			"toggle",
		]);
		expect(doc.content?.[1]?.content?.[0]?.type).toBe("heading");
		expect(serializeNote({ ...note, blocks: docToBlocks(doc) })).toBe(text);
	});

	it("still refuses a toggle whose first child is neither a paragraph nor a heading", () => {
		const result = checkBlocks([
			{ id: "t", type: "toggle", parent: null },
			{ id: "q", type: "blockquote", parent: "t" },
			{ id: "p", type: "paragraph", parent: "q" },
		]);
		expect(result.ok).toBe(false);
	});
});

describe("a column with nothing in it", () => {
	const blocks: Block[] = [
		{ id: "k", type: "columns", parent: null },
		{ id: "c1", type: "column", parent: "k" },
		{ id: "c2", type: "column", parent: "k" },
		{ id: "p2", type: "paragraph", parent: "c2" },
	];

	it("opens with one empty paragraph instead of refusing the whole note", () => {
		expect(checkBlocks(blocks)).toEqual({ ok: true });
		const doc = blocksToDoc(blocks);
		expect(doc.content?.[0]?.content?.[0]?.content).toEqual([
			{ type: "paragraph", attrs: {} },
		]);
	});
});

describe("database row note fixture", () => {
	const text = readFileSync(
		new URL("../../test-fixtures/database-row-note.vnote", import.meta.url),
		"utf8",
	);

	it("keeps which note a row was turned into and saves back byte for byte", () => {
		const parsed = parseNote(text);
		expect(parsed.problems).toEqual([]);
		const note = parsed.note;
		if (!note) throw new Error("fixture did not parse");
		expect(checkBlocks(note.blocks)).toEqual({ ok: true });
		const doc = blocksToDoc(note.blocks);
		const rows = doc.content?.[0]?.content ?? [];
		expect(rows.map((row) => row.attrs?.noteId ?? null)).toEqual([
			"note-dune",
			null,
		]);
		expect(serializeNote({ ...note, blocks: docToBlocks(doc) })).toBe(text);
	});
});
