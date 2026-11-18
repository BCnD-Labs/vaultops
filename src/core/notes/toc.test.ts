import { expect, it } from "vitest";
import type { OutlineItem } from "./outline";
import { outlineTree, tocList } from "./toc";

const item = (level: number, text: string): OutlineItem => ({
	id: null,
	level,
	text,
});

it("nests each heading under the nearest higher heading above it", () => {
	const tree = outlineTree([
		item(1, "Intro"),
		item(2, "Setup"),
		item(3, "Install"),
		item(2, "Use"),
		item(1, "Appendix"),
		item(2, "Glossary"),
	]);
	expect(tree).toEqual([
		{
			text: "Intro",
			children: [
				{
					text: "Setup",
					children: [{ text: "Install", children: [] }],
				},
				{ text: "Use", children: [] },
			],
		},
		{ text: "Appendix", children: [{ text: "Glossary", children: [] }] },
	]);
});

it("nests a skipped level under the nearest higher heading", () => {
	// H1, then H3: the H3 sits under the H1 (there is no H2 to hang it on).
	// Then H2 after the H4: it goes under the H1, not under the H4.
	const tree = outlineTree([
		item(1, "A"),
		item(3, "B"),
		item(4, "C"),
		item(2, "D"),
	]);
	expect(tree).toEqual([
		{
			text: "A",
			children: [
				{ text: "B", children: [{ text: "C", children: [] }] },
				{ text: "D", children: [] },
			],
		},
	]);
});

it("keeps a heading with no higher heading above it at the top", () => {
	expect(outlineTree([item(2, "First"), item(1, "Second")])).toEqual([
		{ text: "First", children: [] },
		{ text: "Second", children: [] },
	]);
});

it("is empty for a note with no headings", () => {
	expect(outlineTree([])).toEqual([]);
	expect(tocList([])).toBeNull();
});

it("builds a plain bulletList with nested lists for the sub-headings", () => {
	const list = tocList([item(1, "Intro"), item(2, "Setup"), item(1, "End")]);
	expect(list).toEqual({
		type: "bulletList",
		content: [
			{
				type: "listItem",
				content: [
					{
						type: "paragraph",
						content: [{ type: "text", text: "Intro" }],
					},
					{
						type: "bulletList",
						content: [
							{
								type: "listItem",
								content: [
									{
										type: "paragraph",
										content: [{ type: "text", text: "Setup" }],
									},
								],
							},
						],
					},
				],
			},
			{
				type: "listItem",
				content: [
					{
						type: "paragraph",
						content: [{ type: "text", text: "End" }],
					},
				],
			},
		],
	});
});
