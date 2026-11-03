import { expect, it, vi } from "vitest";
import { MemoryHost } from "../../host/memory-host";
import { type Note, parseNote, serializeNote } from "../note-format";
import {
	blockPosition,
	canvasRoots,
	saveCanvasPosition,
} from "./canvas-position";

const canvas: Note = {
	header: {
		format: "vaultops-note",
		v: 1,
		noteId: "board",
		kind: "canvas",
		extra: "kept",
	},
	blocks: [
		{
			id: "a",
			type: "paragraph",
			parent: null,
			attrs: { x: 12, y: 30, color: "mint" },
			content: [{ type: "text", text: "Card" }],
		},
		{
			id: "child",
			type: "paragraph",
			parent: "a",
			content: [{ type: "text", text: "Nested" }],
		},
	],
};

it("reads only roots at their saved positions and restores a drag after reload", async () => {
	const host = new MemoryHost();
	const text = serializeNote(canvas);
	await host.writeTextAtomic("Board.vnote", text);
	expect(
		canvasRoots(canvas.blocks).map((block) => [block.id, blockPosition(block)]),
	).toEqual([["a", { x: 12, y: 30 }]]);
	const saved = await saveCanvasPosition(host, "Board.vnote", text, "a", {
		x: 100,
		y: -20,
	});
	expect(await host.readText("Board.vnote")).toBe(saved);
	const reloaded = parseNote(await host.readText("Board.vnote")).note;
	expect(blockPosition(reloaded?.blocks[0] as Note["blocks"][number])).toEqual({
		x: 100,
		y: -20,
	});
	expect(reloaded?.header.extra).toBe("kept");
	expect(reloaded?.blocks[0]?.attrs).toEqual({ x: 100, y: -20, color: "mint" });
	expect(reloaded?.blocks[1]).toEqual(canvas.blocks[1]);
});

it("refuses to overwrite a changed canvas", async () => {
	const host = new MemoryHost();
	const text = serializeNote(canvas);
	await host.writeTextAtomic("Board.vnote", text);
	await host.writeTextAtomic("Board.vnote", `${text} `);
	const write = vi.spyOn(host, "writeTextAtomic");
	await expect(
		saveCanvasPosition(host, "Board.vnote", text, "a", { x: 1, y: 2 }),
	).rejects.toThrow("changed on disk");
	expect(write).not.toHaveBeenCalled();
});
