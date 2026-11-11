import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import { MemoryHost } from "../../host/memory-host";
import type { Block, Note } from "../note-format";
import { parseNote, prepareSave, serializeNote } from "../note-format";
import { extractBlock, insertBlock } from "./block-move";
import {
	embedBlock,
	embeddable,
	embedNoteId,
	resolveEmbed,
} from "./canvas-embed";
import { addRoot, attrsOf, canvasNodes, deleteRoots } from "./canvas-ops";
import { moveBlock } from "./move-block";

const rows = [
	{ id: "n1", kind: "note" as const, path: "a.vnote" },
	{ id: "n2", kind: "note" as const, path: "b.vnote" },
	{ id: "cv", kind: "canvas" as const, path: "board.vnote" },
	{ id: "dup", kind: "note" as const, path: "c1.vnote" },
	{ id: "dup", kind: "note" as const, path: "c2.vnote" },
	{ id: "", kind: "note" as const, path: "noid.vnote" },
	{ kind: "note" as const, path: "undefined.vnote" },
];

it("finds the note by its id, wherever the file is now", () => {
	expect(resolveEmbed(rows, "n2")).toEqual({ status: "found", row: rows[1] });
});

it("says why an embed shows nothing, instead of guessing", () => {
	expect(resolveEmbed(rows, "gone")).toEqual({ status: "missing" });
	expect(resolveEmbed(rows, "dup")).toEqual({ status: "ambiguous", count: 2 });
	expect(resolveEmbed(rows, "cv")).toEqual({ status: "canvas" });
	expect(resolveEmbed(rows, "")).toEqual({ status: "unlinked" });
});

it("offers only notes with an id of their own: no canvases, no shared or empty ids", () => {
	expect(embeddable(rows).map((r) => r.path)).toEqual(["a.vnote", "b.vnote"]);
});

it("makes an embed block centred on a point, and refuses one with no note", () => {
	const block = embedBlock("e1", "n1", { x: 400, y: 300 });
	expect(block).toMatchObject({ id: "e1", type: "embed", parent: null });
	expect(attrsOf(block)).toEqual({
		h: 240,
		note: "n1",
		w: 320,
		x: 240,
		y: 180,
	});
	expect(embedNoteId(block)).toBe("n1");
	expect(embedNoteId({ type: "embed", parent: null })).toBe("");
	expect(() => embedBlock("e2", "", { x: 0, y: 0 })).toThrow("id of a note");
});

const canvas = (blocks: Block[]): Note => ({
	header: { format: "vaultops-note", v: 1, noteId: "board", kind: "canvas" },
	blocks,
});

it("reads the canvas-embed fixture and saves it back byte for byte", () => {
	const text = readFileSync(
		new URL("../../../test-fixtures/canvas-embed.vnote", import.meta.url),
		"utf8",
	);
	const parsed = parseNote(text);
	expect(parsed.problems).toEqual([]);
	if (!parsed.note) throw new Error("fixture did not parse");
	expect(canvasNodes(parsed.note.blocks).map((b) => b.type)).toEqual([
		"embed",
		"sticky",
	]);
	expect(serializeNote(parsed.note)).toBe(text);
});

it("refuses an embed in a note file, so it can never end up in a note", () => {
	const note: Note = {
		header: { format: "vaultops-note", v: 1, noteId: "n" },
		blocks: [embedBlock("e1", "n1", { x: 0, y: 0 })],
	};
	const saved = prepareSave(note);
	expect(saved.ok).toBe(false);
	if (!saved.ok)
		expect(saved.problems.map((p) => p.kind)).toContain("canvas-only-in-note");
	// ... but a canvas may hold it.
	expect(prepareSave(canvas([embedBlock("e1", "n1", { x: 0, y: 0 })])).ok).toBe(
		true,
	);
});

it("refuses to move an embed into a note, before touching either file", async () => {
	const blocks = [embedBlock("e1", "n1", { x: 0, y: 0 })];
	expect(() => extractBlock(canvas(blocks), "e1")).toThrow(
		"stay on the canvas",
	);
	const note: Note = {
		header: { format: "vaultops-note", v: 1, noteId: "n" },
		blocks: [],
	};
	expect(() => insertBlock(note, blocks, null)).toThrow("stay on the canvas");
	const host = new MemoryHost();
	await host.writeTextAtomic("Board.vnote", serializeNote(canvas(blocks)));
	await host.writeTextAtomic("Note.vnote", serializeNote(note));
	const write = vi.spyOn(host, "writeTextAtomic");
	await expect(
		moveBlock(host, "Board.vnote", "Note.vnote", "e1", { after: null }),
	).rejects.toThrow("stay on the canvas");
	expect(write).not.toHaveBeenCalled();
});

it("deleting an embed removes only the embed and any connector on it", () => {
	const blocks = addRoot(
		[
			{ id: "s", type: "sticky", parent: null, attrs: { x: 0, y: 0 } },
			embedBlock("e1", "n1", { x: 0, y: 0 }),
		],
		{
			id: "k",
			type: "connector",
			parent: null,
			attrs: { from: "s", to: "e1" },
		},
	);
	const result = deleteRoots(blocks, ["e1"]);
	expect(result.blocks.map((b) => b.id)).toEqual(["s"]);
	expect(result.connectorsRemoved).toBe(1);
});
