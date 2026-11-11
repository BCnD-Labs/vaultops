import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	type Block,
	type Note,
	parseNote,
	serializeNote,
} from "./note-format.js";

// Property tests: random notes instead of hand-picked ones. They guard the
// rule the whole app leans on: what is written is exactly what is read back.

const text = fc.string({ unit: "grapheme", maxLength: 40 });

const blocks = fc.array(text, { maxLength: 12 }).map((texts): Block[] =>
	texts.map((t, i) => ({
		id: `b${i}`,
		type: "paragraph",
		parent: null,
		content: [{ type: "text", text: t }],
	})),
);

const notes = fc.record({ title: text, blocks }).map(
	({ title, blocks }): Note => ({
		header: {
			format: "vaultops-note",
			v: 1,
			noteId: "n1",
			created: "2026-01-01T00:00:00Z",
			props: {},
			title,
		},
		blocks,
	}),
);

describe("note format properties", () => {
	it("reads back exactly what was written, with no problems", () => {
		fc.assert(
			fc.property(notes, (note) => {
				const parsed = parseNote(serializeNote(note));
				expect(parsed.problems).toEqual([]);
				expect(parsed.skippedLines).toEqual([]);
				expect(parsed.note?.blocks).toEqual(note.blocks);
				expect(parsed.note?.header.title).toBe(note.header.title);
			}),
		);
	});

	it("serializing a parsed note gives the same text again", () => {
		fc.assert(
			fc.property(notes, (note) => {
				const once = serializeNote(note);
				const parsed = parseNote(once);
				expect(parsed.note && serializeNote(parsed.note)).toBe(once);
			}),
		);
	});
});
