import { expect, it } from "vitest";
import { parseNote, prepareSave, serializeNote } from "../note-format";

const note = (content: unknown) => ({
	header: { format: "vaultops-note", v: 1, noteId: "n", title: "T" },
	blocks: [{ id: "b1", type: "paragraph", parent: null, content }],
});

it("content nested thousands of levels deep is refused, not a crash", () => {
	let deep: Record<string, unknown> = { type: "text", text: "x" };
	for (let i = 0; i < 5000; i += 1) deep = { type: "n", content: [deep] };
	const result = prepareSave(note([deep]) as never);
	expect(result.ok).toBe(false);
	// And reading such a line back does not overflow either.
	const line = `{"id":"b1","type":"paragraph","parent":null,"content":${"[".repeat(3000)}${"]".repeat(3000)}}`;
	const header = JSON.stringify(note([]).header);
	expect(() => parseNote(`${header}\n${line}\n`)).not.toThrow();
});

it("an id hidden inside inline content is still reported, with its path", () => {
	const result = prepareSave(
		note([{ type: "text", text: "x", attrs: { id: "oops" } }]) as never,
	);
	expect(result.ok).toBe(false);
});

it("a file that starts with a byte-order mark still opens", () => {
	const text = `\uFEFF${serializeNote(note([{ type: "text", text: "hi" }]) as never)}`;
	const parsed = parseNote(text);
	expect(parsed.note?.blocks.length).toBe(1);
	expect(parsed.problems).toEqual([]);
});
