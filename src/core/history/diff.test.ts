import { describe, expect, it } from "vitest";
import type { Block, Note } from "../note-format";
import { blockText, diffNotes, summarizeDiff, wordChanges } from "./diff";

const p = (id: string, text: string, parent: string | null = null): Block => ({
	id,
	type: "paragraph",
	parent,
	content: [{ type: "text", text }],
});

const note = (blocks: Block[], header: Record<string, unknown> = {}): Note =>
	({
		header: { format: "vaultops-note", v: 1, noteId: "n", ...header },
		blocks,
	}) as Note;

describe("blockText", () => {
	it("joins text and link labels, and is empty for blocks without text", () => {
		expect(
			blockText({
				id: "a",
				type: "paragraph",
				parent: null,
				content: [
					{ type: "text", text: "Ask " },
					{
						type: "noteLink",
						attrs: { kind: "resource", target: "r", label: "Sam" },
					},
				],
			}),
		).toBe("Ask Sam");
		expect(blockText({ id: "d", type: "divider", parent: null })).toBe("");
	});
});

describe("diffNotes", () => {
	it("finds added, removed, changed, retyped and moved blocks", () => {
		const before = note([
			p("a", "One"),
			p("b", "Two"),
			p("c", "Three"),
			p("d", "Four"),
		]);
		const after = note([
			p("b", "Two"),
			p("a", "One"),
			{ ...p("c", "Three"), type: "heading" },
			p("e", "Five"),
		]);
		const d = diffNotes(before, after);
		const kinds = d.blocks.map((b) => [b.id, b.kind, b.moved]);
		expect(kinds).toEqual([
			["a", "moved", true],
			["c", "retyped", false],
			["e", "added", false],
			["d", "removed", false],
		]);
		expect(d.blocks.find((b) => b.id === "c")?.beforeType).toBe("paragraph");
		expect(d.same).toBe(false);
	});

	it("tells an edit from a move to a new parent, and keeps the text before and after", () => {
		const d = diffNotes(
			note([p("t", "Toggle"), p("x", "Old words")]),
			note([p("t", "Toggle"), p("x", "New words", "t")]),
		);
		expect(d.blocks).toEqual([
			{
				id: "x",
				kind: "changed",
				type: "paragraph",
				moved: true,
				before: "Old words",
				after: "New words",
			},
		]);
	});

	it("compares the title, properties and tags, hiding app-written ones", () => {
		const props = (status: string, extra = {}) => ({
			title: "Book",
			props: {
				tags: {
					type: "list",
					value: status === "Reading" ? ["books"] : ["Books", "done"],
				},
				Status: { type: "text", value: status },
				Reflected: { type: "text", value: status },
				...extra,
			},
		});
		const d = diffNotes(
			note([], props("Reading", { Pages: { type: "number", value: 3 } })),
			note([], { ...props("Finished"), title: "Dune" }),
		);
		expect(d.title).toEqual({ before: "Book", after: "Dune" });
		expect(d.props).toEqual([
			{ name: "Status", kind: "changed", before: "Reading", after: "Finished" },
			{ name: "Pages", kind: "removed", before: "3" },
		]);
		expect(d.tagsAdded).toEqual(["done"]);
		expect(d.tagsRemoved).toEqual([]);
		expect(
			diffNotes(note([], props("Reading")), note([], props("Finished")), {
				showAppWritten: true,
			}).props.map((c) => c.name),
		).toContain("Reflected");
	});

	it("treats a missing version as all added or all removed, and same as same", () => {
		const n = note([p("a", "Hi")], { title: "T" });
		expect(diffNotes(null, n).blocks.map((b) => b.kind)).toEqual(["added"]);
		expect(diffNotes(n, null).blocks.map((b) => b.kind)).toEqual(["removed"]);
		expect(diffNotes(n, structuredClone(n)).same).toBe(true);
	});

	it("compares unknown block types without failing", () => {
		const block = {
			id: "z",
			type: "future-widget",
			parent: null,
			data: { v: 1 },
		};
		const d = diffNotes(note([block]), note([{ ...block, data: { v: 2 } }]));
		expect(d.blocks.map((b) => [b.type, b.kind])).toEqual([
			["future-widget", "changed"],
		]);
	});
});

describe("summarizeDiff", () => {
	it("says what changed in one line", () => {
		const d = diffNotes(
			note([p("a", "One")], {
				props: { Status: { type: "text", value: "A" } },
			}),
			note([p("a", "Uno"), p("b", "Two"), p("c", "Three")], {
				props: {
					Status: { type: "text", value: "B" },
					tags: { type: "list", value: ["x"] },
				},
			}),
		);
		expect(summarizeDiff(d)).toBe(
			"2 blocks added, 1 changed · Status changed, 1 tag added",
		);
		expect(summarizeDiff(diffNotes(null, null))).toBe("No changes");
	});
});

describe("wordChanges", () => {
	it("marks added and removed words and keeps the rest", () => {
		expect(wordChanges("The quick fox", "The slow fox jumps")).toEqual([
			{ text: "The ", kind: "same" },
			{ text: "quick", kind: "removed" },
			{ text: "slow", kind: "added" },
			{ text: " fox", kind: "same" },
			{ text: " jumps", kind: "added" },
		]);
		expect(wordChanges("same", "same")).toEqual([
			{ text: "same", kind: "same" },
		]);
	});
});
