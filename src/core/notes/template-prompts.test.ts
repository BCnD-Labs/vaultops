import { describe, expect, it } from "vitest";
import type { Note } from "../note-format";
import { blocksFromTemplate, extractPrompts, fillTemplate } from "./templates";

const now = new Date(2026, 10, 18, 10);
const note = (text: string): Note => ({
	header: { format: "vaultops-note", v: 1, noteId: "n", title: "Template" },
	blocks: [
		{
			id: "a",
			type: "paragraph",
			parent: null,
			content: [{ type: "text", text }],
		},
	],
});
const textOf = (block: Note["blocks"][number] | undefined) =>
	(block?.content as { text: string }[] | undefined)?.[0]?.text;

describe("smart template prompts", () => {
	it("extracts all types, deduplicating by name and preferring the first explicit declaration", () => {
		const t = note(
			"{{?Client}} {{prompt:client|text|Acme}} {{prompt:CLIENT|number|2}} {{prompt:Count|number|1}} {{prompt:When|date|today}} {{prompt:Paid|checkbox|true}} {{prompt:People|list|A, B}} {{prompt:Priority|select|Low, Medium, High|Medium}}",
		);
		t.header.props = { Extra: { type: "text", value: "{{?Extra}}" } };
		expect(extractPrompts(t, now)).toEqual([
			{ label: "client", type: "text", options: [], default: "Acme" },
			{ label: "Count", type: "number", options: [], default: 1 },
			{ label: "When", type: "date", options: [], default: "2026-11-18" },
			{ label: "Paid", type: "checkbox", options: [], default: true },
			{ label: "People", type: "list", options: [], default: ["A", "B"] },
			{
				label: "Priority",
				type: "select",
				options: ["Low", "Medium", "High"],
				default: "Medium",
			},
			{ label: "Extra", type: "text", options: [], default: "" },
		]);
	});
	it("fills typed properties, formatted body and a dynamic title without mutating the template", () => {
		const t = note(
			"{{?Client}}: {{prompt:Count|number|1}}, {{prompt:When|date|tomorrow}}, {{prompt:Paid|checkbox|true}}, {{prompt:People|list}}, {{prompt:Priority|select|Low, High|Low}} {{unknown}}",
		);
		t.header.titleTemplate = "Meeting with {{?Client}} {{date:today}}";
		t.header.props = {
			client: { type: "text", value: "" },
			Headcount: { type: "text", value: "{{prompt:Count|number}}", extra: 1 },
			When: { type: "date", value: null },
			Paid: { type: "checkbox", value: false },
			People: { type: "list", value: [] },
			Priority: { type: "select", value: null, options: ["Low", "High"] },
		};
		const before = JSON.stringify(t);
		const result = fillTemplate(t, "Fallback", {
			now,
			formats: { date: "DD MMM YYYY", time: "24h" },
			answers: { CLIENT: "Ada", Count: 5, Paid: false, People: ["A", "B"] },
		});
		expect(result.title).toBe("Meeting with Ada 18 Nov 2026");
		expect(textOf(result.blocks[0])).toBe(
			"Ada: 5, 19 Nov 2026, No, A, B, Low {{unknown}}",
		);
		expect(result.props).toEqual({
			client: { type: "text", value: "Ada" },
			Headcount: { type: "number", value: 5, extra: 1 },
			When: { type: "date", value: "2026-11-19" },
			Paid: { type: "checkbox", value: false },
			People: { type: "list", value: ["A", "B"] },
			Priority: { type: "select", value: "Low", options: ["Low", "High"] },
		});
		expect(JSON.stringify(t)).toBe(before);
	});
	it("replaces selections and removes all cursor markers, reporting the first offset across fragments", () => {
		const t = note("Start {{selection}} ");
		const block = t.blocks[0];
		if (!block) throw new Error("missing block");
		block.content = [
			{ type: "text", text: "Start {{selection}} " },
			{ type: "text", text: "{{?Who}}{{cursor}} end {{cursor}}" },
		];
		const result = fillTemplate(t, "T", {
			now,
			selection: "here",
			answers: { Who: "Ada" },
		});
		expect(result.cursor).toEqual({
			blockId: result.blocks[0]?.id,
			offset: 14,
		});
		expect(result.blocks[0]?.content).toEqual([
			{ type: "text", text: "Start here " },
			{ type: "text", text: "Ada end " },
		]);
		expect(
			textOf(
				fillTemplate(note("{{selection}} {{cursor}}"), "T", { now }).blocks[0],
			),
		).toBe(" ");
	});
	it("keeps markers inside answers and selections as literal text", () => {
		const result = fillTemplate(note("{{?A}} {{selection}}{{cursor}}"), "T", {
			now,
			answers: { A: "{{selection}}" },
			selection: "{{cursor}}",
		});
		expect(textOf(result.blocks[0])).toBe("{{selection}} {{cursor}}");
		expect(result.cursor?.offset).toBe(24);
	});
	it("keeps old templates equivalent and uses empty values for missing answers", () => {
		const old = note("{{title}} {{date}} {{time}} {{other}}");
		const existing = blocksFromTemplate(old, "Hello", now);
		const result = fillTemplate(old, "Hello", { now });
		expect(textOf(result.blocks[0])).toBe(textOf(existing[0]));
		expect(result.title).toBe("Hello");
		expect(result.cursor).toBeNull();
		expect(
			textOf(
				fillTemplate(
					note(
						"{{?Missing}}/{{prompt:N|number}}/{{prompt:L|list}}/{{prompt:C|checkbox}}",
					),
					"T",
					{ now },
				).blocks[0],
			),
		).toBe("///");
	});
});
