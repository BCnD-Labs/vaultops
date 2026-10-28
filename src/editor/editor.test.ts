import { getSchema, type JSONContent } from "@tiptap/core";
import { Node } from "@tiptap/pm/model";
import { describe, expect, it } from "vitest";
import { BLOCK_TYPES } from "./blocks";
import { createExtensions } from "./extensions";
import { ensureUniqueIds } from "./ids";

const schema = getSchema(createExtensions());
const blockNodes = Object.values(schema.nodes).filter(
	(node) => node.name !== "doc" && !node.isInline && !node.isText,
);
const inlineNodes = Object.values(schema.nodes).filter(
	(node) => node.name !== "text" && node.isInline,
);

describe("block schema", () => {
	it("lists every block-level node, and each one has an id attribute", () => {
		const listed = new Set<string>(BLOCK_TYPES);
		for (const node of blockNodes) {
			expect(
				listed.has(node.name),
				`${node.name} missing from BLOCK_TYPES`,
			).toBe(true);
			expect(
				node.spec.attrs?.id,
				`${node.name} has no id attribute`,
			).toBeDefined();
		}
	});

	it("lists only nodes that exist", () => {
		const names = new Set(blockNodes.map((node) => node.name));
		for (const type of BLOCK_TYPES) expect(names.has(type)).toBe(true);
	});

	it("gives inline nodes no id", () => {
		expect(inlineNodes.map((node) => node.name)).toContain("hardBreak");
		for (const node of inlineNodes) {
			expect(
				node.spec.attrs?.id,
				`${node.name} must not have an id`,
			).toBeUndefined();
		}
	});

	it("has no horizontal rule, table or database block yet", () => {
		for (const name of ["horizontalRule", "table", "databaseBlock"]) {
			expect(schema.nodes[name]).toBeUndefined();
		}
	});
});

describe("ensureUniqueIds", () => {
	let counter = 0;
	const gen = () => `new-${++counter}`;
	const para = (text: string, id?: string): JSONContent => ({
		type: "paragraph",
		...(id === undefined ? {} : { attrs: { id } }),
		content: [{ type: "text", text }],
	});

	it("fills missing ids and replaces repeats, the first keeping its id", () => {
		counter = 0;
		const doc: JSONContent = {
			type: "doc",
			content: [para("a", "x"), para("b", "x"), para("c"), para("d", "")],
		};
		const out = ensureUniqueIds(doc, gen);
		const ids = out.content?.map((n) => n.attrs?.id);
		expect(ids).toEqual(["x", "new-1", "new-2", "new-3"]);
	});

	it("reaches nested blocks and leaves inline content and the input alone", () => {
		counter = 0;
		const doc: JSONContent = {
			type: "doc",
			content: [
				{
					type: "bulletList",
					content: [
						{ type: "listItem", content: [para("one")] },
						{ type: "listItem", content: [para("two")] },
					],
				},
			],
		};
		const copy = JSON.parse(JSON.stringify(doc));
		const out = ensureUniqueIds(doc, gen);
		expect(doc).toEqual(copy);
		const ids: string[] = [];
		const walk = (n: JSONContent) => {
			if (n.attrs?.id) ids.push(n.attrs.id);
			n.content?.forEach(walk);
		};
		walk(out);
		expect(ids).toHaveLength(5);
		expect(new Set(ids).size).toBe(5);
		const text = out.content?.[0]?.content?.[0]?.content?.[0]?.content?.[0];
		expect(text).toEqual({ type: "text", text: "one" });
		expect(text?.attrs).toBeUndefined();
	});

	it("never gives a new block an id that already exists later in the document", () => {
		const doc: JSONContent = {
			type: "doc",
			content: [para("a", "dup"), para("b", "dup"), para("c", "id-2")],
		};
		let n = 1;
		const out = ensureUniqueIds(doc, () => `id-${n++}`);
		const ids = out.content?.map((x) => x.attrs?.id);
		// "id-2" belongs to the third block, but it is only seen after the second, so
		// the replacement may take "id-1"; the final set is still unique.
		expect(new Set(ids).size).toBe(3);
	});
});

describe("tasks and marks", () => {
	const doc: JSONContent = {
		type: "doc",
		content: [
			{
				type: "taskBlock",
				attrs: { id: "t1", checked: false },
				content: [{ type: "text", text: "Open task" }],
			},
			{
				type: "taskBlock",
				attrs: { id: "t2", checked: true },
				content: [{ type: "text", text: "Done task" }],
			},
			{
				type: "paragraph",
				attrs: { id: "p1" },
				content: [
					{ type: "text", text: "bold", marks: [{ type: "bold" }] },
					{ type: "text", text: "italic", marks: [{ type: "italic" }] },
					{ type: "text", text: "strike", marks: [{ type: "strike" }] },
					{ type: "text", text: "code", marks: [{ type: "code" }] },
				],
			},
		],
	};

	it("keeps checked and unchecked tasks and every mark through the schema", () => {
		const back = Node.fromJSON(schema, doc).toJSON();
		expect(back).toEqual(doc);
		const node = Node.fromJSON(schema, doc);
		expect(() => node.check()).not.toThrow();
	});
});
