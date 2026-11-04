import type { JSONContent } from "@tiptap/core";
import { expect, it } from "vitest";
import { textStats } from "./text-stats";

const p = (text: string): JSONContent => ({
	type: "paragraph",
	content: text ? [{ type: "text", text }] : undefined,
});

it("counts words and characters across blocks without joining them", () => {
	const doc: JSONContent = {
		type: "doc",
		content: [p("Hello world"), p("again")],
	};
	expect(textStats(doc)).toEqual({ words: 3, characters: 16 });
});

it("is zero for nothing, an empty note and a missing note", () => {
	expect(textStats(null)).toEqual({ words: 0, characters: 0 });
	expect(textStats(undefined)).toEqual({ words: 0, characters: 0 });
	expect(textStats({ type: "doc", content: [p("")] })).toEqual({
		words: 0,
		characters: 0,
	});
});

it("reaches text inside lists, quotes and toggles-like containers", () => {
	const doc: JSONContent = {
		type: "doc",
		content: [
			{
				type: "bulletList",
				content: [
					{ type: "listItem", content: [p("one two")] },
					{ type: "listItem", content: [p("three")] },
				],
			},
			{ type: "blockquote", content: [p("four")] },
		],
	};
	expect(textStats(doc).words).toBe(4);
});

it("counts a letter outside the basic plane as one character", () => {
	expect(textStats({ type: "doc", content: [p("a😀b")] }).characters).toBe(3);
});

it("does not count punctuation alone as a word", () => {
	expect(textStats({ type: "doc", content: [p("hi — there!")] }).words).toBe(2);
});
