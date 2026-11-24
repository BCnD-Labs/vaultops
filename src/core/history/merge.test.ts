import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Block, Note } from "../note-format";
import { prepareSave } from "../note-format";
import { blockText } from "./diff";
import { mergeNotes } from "./merge";

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

let n = 0;
const options = { theirsLabel: "try-out", newId: () => `x${++n}` };
const texts = (result: Note) => result.blocks.map(blockText);

describe("mergeNotes blocks", () => {
	it("takes each side's change and keeps blocks added on either side", () => {
		const base = note([p("a", "One"), p("b", "Two"), p("c", "Three")]);
		const mine = note([
			p("a", "One!"),
			p("b", "Two"),
			p("c", "Three"),
			p("m", "Mine new"),
		]);
		const theirs = note([
			p("a", "One"),
			p("t", "Theirs new"),
			p("b", "Two?"),
			p("c", "Three"),
		]);
		const { note: merged, conflicts } = mergeNotes(base, mine, theirs, options);
		expect(texts(merged)).toEqual([
			"One!",
			"Theirs new",
			"Two?",
			"Three",
			"Mine new",
		]);
		expect(conflicts).toEqual([]);
	});

	it("deletes what one side deleted and the other left alone, but keeps a deleted block the other side edited", () => {
		const base = note([p("a", "Keep"), p("b", "Bye"), p("c", "Edited there")]);
		const mine = note([p("a", "Keep")]);
		const theirs = note([
			p("a", "Keep"),
			p("b", "Bye"),
			p("c", "Edited there, more"),
		]);
		const { note: merged, conflicts } = mergeNotes(base, mine, theirs, options);
		expect(texts(merged)).toEqual(["Keep", "Edited there, more"]);
		expect(conflicts).toEqual([{ kind: "kept-edited", id: "c" }]);
	});

	it("combines a retype on one side with a text edit on the other", () => {
		const base = note([p("a", "Title")]);
		const mine = note([{ ...p("a", "Title"), type: "heading" }]);
		const theirs = note([p("a", "Better title")]);
		const { note: merged, conflicts } = mergeNotes(base, mine, theirs, options);
		expect(merged.blocks).toEqual([
			{ ...p("a", "Better title"), type: "heading" },
		]);
		expect(conflicts).toEqual([]);
	});

	it("keeps both versions when the same paragraph changed on both sides", () => {
		n = 0;
		const base = note([p("a", "Draft")]);
		const { note: merged, conflicts } = mergeNotes(
			base,
			note([p("a", "My draft")]),
			note([p("a", "Their draft")]),
			options,
		);
		expect(texts(merged)).toEqual([
			"My draft",
			"",
			"Also changed on try-out:",
			"Their draft",
		]);
		expect(merged.blocks[1]).toMatchObject({
			id: "x1",
			type: "callout",
			parent: null,
		});
		expect(merged.blocks[3]).toMatchObject({ id: "x3", parent: "x1" });
		expect(conflicts).toEqual([{ kind: "block", id: "a", calloutId: "x1" }]);
		expect(prepareSave(merged).ok).toBe(true);
	});

	it("moves a block whose parent was deleted to the top level", () => {
		const base = note([p("t", "Toggle"), p("c", "Child", "t")]);
		const theirs = note([p("t", "Toggle"), p("c", "Child edited", "t")]);
		// Mine deleted the toggle only, then both toggle and child.
		const onlyParent = mergeNotes(
			base,
			note([p("c", "Child", "t")]),
			theirs,
			options,
		);
		expect(onlyParent.note.blocks).toEqual([p("c", "Child edited", null)]);
		const both = mergeNotes(base, note([]), theirs, options);
		expect(both.note.blocks).toEqual([p("c", "Child edited", null)]);
		expect(both.conflicts).toEqual([{ kind: "kept-edited", id: "c" }]);
	});
});

describe("mergeNotes header", () => {
	const props = (extra: Record<string, unknown>) => ({ props: extra });
	it("merges properties one by one, lists as sets, and keeps mine on a clash", () => {
		const base = note([], {
			title: "Book",
			...props({
				Status: { type: "text", value: "Reading" },
				Pages: { type: "number", value: 1 },
				tags: { type: "list", value: ["books", "old"] },
			}),
		});
		const mine = note([], {
			title: "Book",
			...props({
				Status: { type: "text", value: "Finished" },
				Pages: { type: "number", value: 2 },
				tags: { type: "list", value: ["books", "mine"] },
			}),
		});
		const theirs = note([], {
			title: "Dune",
			...props({
				Status: { type: "text", value: "Reading" },
				Pages: { type: "number", value: 3 },
				tags: { type: "list", value: ["books", "old", "theirs"] },
				Rating: { type: "number", value: 5 },
			}),
		});
		const { note: merged, conflicts } = mergeNotes(base, mine, theirs, options);
		expect(merged.header.title).toBe("Dune");
		expect(merged.header.props).toEqual({
			Status: { type: "text", value: "Finished" },
			Pages: { type: "number", value: 2 },
			tags: { type: "list", value: ["books", "mine", "theirs"] },
			Rating: { type: "number", value: 5 },
		});
		expect(conflicts).toEqual([
			{
				kind: "property",
				name: "Pages",
				mine: { type: "number", value: 2 },
				theirs: { type: "number", value: 3 },
			},
		]);
	});

	it("records a title changed differently on both sides and keeps mine", () => {
		const { note: merged, conflicts } = mergeNotes(
			note([], { title: "A" }),
			note([], { title: "B" }),
			note([], { title: "C" }),
			options,
		);
		expect(merged.header.title).toBe("B");
		expect(conflicts).toEqual([{ kind: "title", mine: "B", theirs: "C" }]);
	});
});

// Random edits on both sides: no text either side wrote is ever lost, and the
// result can always be saved.
describe("mergeNotes never loses text", () => {
	type Op =
		| { kind: "edit" | "delete" | "retype"; at: number }
		| { kind: "add"; at: number };
	const op = fc.oneof(
		fc.record({
			kind: fc.constantFrom("edit", "delete", "retype"),
			at: fc.nat(9),
		}),
		fc.record({ kind: fc.constant("add"), at: fc.nat(9) }),
	) as fc.Arbitrary<Op>;

	function apply(base: Block[], ops: Op[], side: string): Block[] {
		let blocks = base.map((b) => structuredClone(b));
		ops.forEach((o, i) => {
			const target = blocks[o.at % Math.max(blocks.length, 1)];
			if (o.kind === "add") {
				blocks.splice(
					o.at % (blocks.length + 1),
					0,
					p(`${side}${i}`, `${side}-added-${i}`),
				);
			} else if (!target) {
				return;
			} else if (o.kind === "edit") {
				target.content = [
					{ type: "text", text: `${side}-edit-${i}-${blockText(target)}` },
				];
			} else if (o.kind === "retype") {
				target.type = target.type === "heading" ? "paragraph" : "heading";
			} else {
				blocks = blocks.filter((b) => b !== target);
			}
		});
		return blocks;
	}

	it("keeps every text written on either side and stays saveable", () => {
		fc.assert(
			fc.property(
				fc.array(op, { maxLength: 8 }),
				fc.array(op, { maxLength: 8 }),
				(mineOps, theirOps) => {
					const baseBlocks = Array.from({ length: 6 }, (_, i) =>
						p(`b${i}`, `base ${i}`),
					);
					const mine = note(apply(baseBlocks, mineOps, "m"));
					const theirs = note(apply(baseBlocks, theirOps, "t"));
					const merged = mergeNotes(
						note(baseBlocks),
						mine,
						theirs,
						options,
					).note;
					const all = texts(merged).join("\n");
					const written = [...mine.blocks, ...theirs.blocks]
						.map(blockText)
						.filter((text) => !text.startsWith("base "));
					for (const text of written) expect(all).toContain(text);
					expect(prepareSave(merged).ok).toBe(true);
				},
			),
		);
	});
});
