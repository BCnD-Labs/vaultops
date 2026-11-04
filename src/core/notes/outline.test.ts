import type { JSONContent } from "@tiptap/core";
import { expect, it } from "vitest";
import { outlineOf } from "./outline";

const h = (level: number, text: string, id?: string): JSONContent => ({
	type: "heading",
	attrs: { level, ...(id ? { id } : {}) },
	content: text ? [{ type: "text", text }] : undefined,
});

it("lists headings in order with level, text and id", () => {
	const doc: JSONContent = {
		type: "doc",
		content: [
			h(1, "Intro", "a"),
			{ type: "paragraph", content: [{ type: "text", text: "body" }] },
			h(2, "Details", "b"),
		],
	};
	expect(outlineOf(doc)).toEqual([
		{ id: "a", level: 1, text: "Intro" },
		{ id: "b", level: 2, text: "Details" },
	]);
});

it("skips empty headings and tolerates a missing id", () => {
	const doc: JSONContent = {
		type: "doc",
		content: [h(1, ""), h(2, "  "), h(1, "Kept")],
	};
	expect(outlineOf(doc)).toEqual([{ id: null, level: 1, text: "Kept" }]);
});

it("finds headings nested in other blocks", () => {
	const doc: JSONContent = {
		type: "doc",
		content: [{ type: "callout", content: [h(2, "Inside", "c")] }],
	};
	expect(outlineOf(doc)).toEqual([{ id: "c", level: 2, text: "Inside" }]);
});

it("is empty for no document", () => {
	expect(outlineOf(null)).toEqual([]);
	expect(outlineOf(undefined)).toEqual([]);
	expect(outlineOf({ type: "doc" })).toEqual([]);
});
