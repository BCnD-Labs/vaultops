import { describe, expect, it } from "vitest";
import {
	buildRecoveryText,
	docToPlainText,
	joinRecovery,
	MAX_RECOVERY_CHARS,
} from "./recovery";

const p = (text: string) => ({
	type: "paragraph",
	content: [{ type: "text", text }],
});

describe("docToPlainText", () => {
	it("puts each block on its own line", () => {
		expect(docToPlainText({ type: "doc", content: [p("one"), p("two")] })).toBe(
			"one\ntwo",
		);
	});

	it("reaches into lists and quotes", () => {
		const doc = {
			type: "doc",
			content: [
				{
					type: "bulletList",
					content: [
						{ type: "listItem", content: [p("a")] },
						{ type: "listItem", content: [p("b")] },
					],
				},
				{ type: "blockquote", content: [p("q")] },
			],
		};
		expect(docToPlainText(doc)).toBe("a\nb\nq");
	});

	it("keeps empty paragraphs as blank lines and joins inline marks", () => {
		const doc = {
			type: "doc",
			content: [
				{
					type: "paragraph",
					content: [
						{ type: "text", text: "a" },
						{ type: "text", text: "b" },
					],
				},
				{ type: "paragraph" },
				p("c"),
			],
		};
		expect(docToPlainText(doc)).toBe("ab\n\nc");
	});
});

describe("buildRecoveryText", () => {
	it("names the note and carries the text", () => {
		const text = buildRecoveryText({
			path: "Ideas.vnote",
			title: "Ideas",
			doc: { type: "doc", content: [p("hello")] },
			now: new Date("2026-10-28T12:00:00.000Z"),
		});
		expect(text).toContain("note: Ideas.vnote");
		expect(text).toContain("title: Ideas");
		expect(text).toContain("\nhello\n");
	});

	it("says when the note was never saved", () => {
		expect(
			buildRecoveryText({
				path: null,
				title: "",
				doc: { type: "doc" },
				now: new Date(),
			}),
		).toContain("(not saved yet)");
	});
});

describe("joinRecovery", () => {
	it("puts the new copy first and keeps the older ones", () => {
		expect(joinRecovery("new\n", "old\n")).toBe(
			"new\n\n----------------\n\nold\n",
		);
	});

	it("is just the new copy when nothing older is kept", () => {
		expect(joinRecovery("new", null)).toBe("new");
		expect(joinRecovery("new", "  \n")).toBe("new");
	});

	it("cuts the oldest text, never the new copy, when too big", () => {
		const fresh = "n".repeat(100);
		const joined = joinRecovery(fresh, "o".repeat(MAX_RECOVERY_CHARS));
		expect(joined.startsWith(fresh)).toBe(true);
		expect(joined.length).toBeLessThanOrEqual(MAX_RECOVERY_CHARS + 30);
	});
});
