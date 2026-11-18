import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vitest";
import { ChartBlock, MISSING_CHART_TEXT } from "./chart-block";

describe("chart block", () => {
	it("round-trips chart attributes through editor load and save", () => {
		const content = {
			type: "doc",
			content: [
				{ type: "paragraph" },
				{
					type: "chart",
					attrs: {
						databaseId: "table-1",
						labelColumn: "name",
						valueColumns: ["total"],
						kind: "bar",
						aggregation: "average",
					},
				},
			],
		};
		const first = new Editor({ extensions: [StarterKit, ChartBlock], content });
		const loaded = first.getJSON();
		const edited = {
			...loaded,
			content: [
				{ type: "paragraph", content: [{ type: "text", text: "Edited" }] },
				...(loaded.content?.slice(1) ?? []),
			],
		};
		const second = new Editor({
			extensions: [StarterKit, ChartBlock],
			content: edited,
		});
		expect(second.getJSON()).toEqual(edited);
		expect(edited.content[1]).toMatchObject({
			attrs: {
				databaseId: "table-1",
				valueColumns: ["total"],
				kind: "bar",
			},
		});
		first.destroy();
		second.destroy();
	});
	it("has a calm missing-table card message", () => {
		expect(MISSING_CHART_TEXT).toBe("This chart's table is gone");
	});
});
