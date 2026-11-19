import { expect, it } from "vitest";
import { highlightsOf } from "./highlights";

it("merges across other marks, follows columns, and skips database cells", () => {
	const mark = { type: "highlight" };
	const run = { type: "text", text: "one", marks: [mark] };
	const block = {
		type: "paragraph",
		attrs: { id: "a" },
		content: [
			run,
			{ ...run, marks: [mark, { type: "bold" }] },
			{ ...run, marks: [{ type: "highlight", attrs: { color: "blue" } }] },
		],
	};
	expect(
		highlightsOf([
			block,
			{ type: "database", content: [block] },
			{
				type: "columns",
				content: [
					{
						type: "column",
						content: [{ ...block, attrs: { id: "b" }, content: [run] }],
					},
				],
			},
		]),
	).toEqual([
		{ blockId: "a", text: "oneone", color: "yellow", offset: 0 },
		{ blockId: "a", text: "one", color: "blue", offset: 6 },
		{ blockId: "b", text: "one", color: "yellow", offset: 0 },
	]);
});
