import type { JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import type { Block } from "../core/note-format";
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
			],
		});
		expect(blocks.map((b) => b.attrs)).toEqual([
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
