import { mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { MemoryHost } from "../../host/memory-host";
import { type Note, parseNote, serializeNote } from "../note-format";
import { moveBlock, undoMove } from "./move-block";
import { loadNote } from "./repository";

const doc = (id: string, canvas = false): Note => ({
	header: {
		format: "vaultops-note",
		v: 1,
		noteId: id,
		...(canvas ? { kind: "canvas" } : {}),
	},
	blocks: canvas
		? []
		: [
				{
					id: "block",
					type: "paragraph",
					parent: null,
					content: [{ type: "text", text: "Keep me" }],
				},
			],
});

it("writes destination first and puts it back when the source write fails", async () => {
	const host = new MemoryHost();
	await host.writeTextAtomic("source.vnote", serializeNote(doc("source")));
	await host.writeTextAtomic(
		"canvas.vnote",
		serializeNote(doc("canvas", true)),
	);
	const original = await host.readText("source.vnote");
	const write = vi.spyOn(host, "writeTextAtomic");
	write.mockImplementationOnce(async (path, text) =>
		MemoryHost.prototype.writeTextAtomic.call(host, path, text),
	);
	write.mockRejectedValueOnce(new Error("disk full"));
	await expect(
		moveBlock(host, "source.vnote", "canvas.vnote", "block", { x: 3, y: 4 }),
	).rejects.toThrow("The block was not moved");
	expect(write.mock.calls.map(([path]) => path)).toEqual([
		"canvas.vnote",
		"source.vnote",
		"canvas.vnote",
	]);
	// Both files are exactly as they were: the move did not half happen.
	expect(await host.readText("source.vnote")).toBe(original);
	expect(parseNote(await host.readText("canvas.vnote")).note?.blocks).toEqual(
		[],
	);
});

it("says the block is in both files, and what to do, only when putting the destination back also fails", async () => {
	const host = new MemoryHost();
	await host.writeTextAtomic("source.vnote", serializeNote(doc("source")));
	await host.writeTextAtomic(
		"canvas.vnote",
		serializeNote(doc("canvas", true)),
	);
	const write = vi.spyOn(host, "writeTextAtomic");
	write.mockImplementationOnce(async (path, text) =>
		MemoryHost.prototype.writeTextAtomic.call(host, path, text),
	);
	write.mockRejectedValueOnce(new Error("disk full"));
	write.mockRejectedValueOnce(new Error("disk still full"));
	await expect(
		moveBlock(host, "source.vnote", "canvas.vnote", "block", { x: 3, y: 4 }),
	).rejects.toThrow("so it is in both. Nothing is lost: delete the extra copy");
	expect(
		parseNote(await host.readText("canvas.vnote")).note?.blocks[0],
	).toMatchObject({ id: "block" });
});

it("refuses a duplicate destination ID before writing", async () => {
	const host = new MemoryHost();
	await host.writeTextAtomic("source.vnote", serializeNote(doc("source")));
	await host.writeTextAtomic("other.vnote", serializeNote(doc("other")));
	const write = vi.spyOn(host, "writeTextAtomic");
	await expect(
		moveBlock(host, "source.vnote", "other.vnote", "block", { after: null }),
	).rejects.toThrow("already contains");
	expect(write).not.toHaveBeenCalled();
});

it("refuses two names for the same file before writing", async () => {
	const host = new MemoryHost();
	const write = vi.spyOn(host, "writeTextAtomic");
	await expect(
		moveBlock(host, "Board.vnote", "board.vnote", "block", { after: null }),
	).rejects.toThrow("different destination");
	expect(write).not.toHaveBeenCalled();
});

it("moves a block from canvas back to a note without canvas positions", async () => {
	const host = new MemoryHost();
	const canvas = doc("canvas", true);
	canvas.blocks = [
		{ id: "block", type: "paragraph", parent: null, attrs: { x: 3, y: 4 } },
	];
	await host.writeTextAtomic("canvas.vnote", serializeNote(canvas));
	await host.writeTextAtomic(
		"note.vnote",
		serializeNote({ ...doc("note"), blocks: [] }),
	);
	await moveBlock(host, "canvas.vnote", "note.vnote", "block", { after: null });
	expect(parseNote(await host.readText("canvas.vnote")).note?.blocks).toEqual(
		[],
	);
	expect(parseNote(await host.readText("note.vnote")).note?.blocks).toEqual([
		{ id: "block", type: "paragraph", parent: null },
	]);
});

it("reloads the moved block from physical note files after reopening the file layer", async () => {
	const folder = await mkdtemp(join(tmpdir(), "vaultops-block-move-"));
	class FileHost extends MemoryHost {
		override readText(path: string) {
			return readFile(join(folder, path), "utf8");
		}
		override async writeTextAtomic(path: string, text: string) {
			const target = join(folder, path);
			const temporary = `${target}.${crypto.randomUUID()}.tmp`;
			await writeFile(temporary, text);
			await rename(temporary, target);
		}
	}
	try {
		const first = new FileHost();
		await first.writeTextAtomic("source.vnote", serializeNote(doc("source")));
		await first.writeTextAtomic(
			"canvas.vnote",
			serializeNote(doc("canvas", true)),
		);
		await moveBlock(first, "source.vnote", "canvas.vnote", "block", {
			x: 9,
			y: 11,
		});
		const reopened = new FileHost();
		expect((await loadNote(reopened, "source.vnote")).note?.blocks).toEqual([]);
		expect(
			(await loadNote(reopened, "canvas.vnote")).note?.blocks[0],
		).toMatchObject({
			id: "block",
			attrs: { x: 9, y: 11 },
		});
		await moveBlock(reopened, "canvas.vnote", "source.vnote", "block", {
			after: null,
		});
		const returned = new FileHost();
		expect((await loadNote(returned, "canvas.vnote")).note?.blocks).toEqual([]);
		expect(
			(await loadNote(returned, "source.vnote")).note?.blocks[0],
		).toMatchObject({
			id: "block",
			content: [{ type: "text", text: "Keep me" }],
		});
	} finally {
		await rm(folder, { recursive: true, force: true });
	}
});

const withStructure = (): Note => ({
	header: { format: "vaultops-note", v: 1, noteId: "canvas", kind: "canvas" },
	blocks: [
		{ id: "a", type: "paragraph", parent: null, attrs: { x: 1, y: 1 } },
		{ id: "b", type: "paragraph", parent: null, attrs: { x: 9, y: 9 } },
		{
			id: "link",
			type: "connector",
			parent: null,
			attrs: { from: "a", to: "b" },
		},
		{
			id: "grp",
			type: "group",
			parent: null,
			attrs: { x: 0, y: 0, members: ["a", "b"] },
		},
	],
});

it("copies a canvas to the recovery folder before a card takes its connectors and group place away, and says what was lost", async () => {
	const host = new MemoryHost();
	await host.writeTextAtomic("canvas.vnote", serializeNote(withStructure()));
	await host.writeTextAtomic(
		"note.vnote",
		serializeNote({ ...doc("note"), blocks: [] }),
	);
	const before = await host.readText("canvas.vnote");
	const receipt = await moveBlock(host, "canvas.vnote", "note.vnote", "a", {
		after: null,
	});
	expect(receipt.lost).toEqual({ connectors: 1, groups: 1 });
	expect(receipt.recoveryPath).toMatch(
		/^\.vaultops\/recovery\/.+\/moved-from\/canvas\.vnote$/,
	);
	expect(await host.readText(receipt.recoveryPath ?? "")).toBe(before);
});

it("keeps no recovery copy when nothing structural is lost", async () => {
	const host = new MemoryHost();
	await host.writeTextAtomic("source.vnote", serializeNote(doc("source")));
	await host.writeTextAtomic(
		"canvas.vnote",
		serializeNote(doc("canvas", true)),
	);
	const receipt = await moveBlock(
		host,
		"source.vnote",
		"canvas.vnote",
		"block",
		{
			x: 1,
			y: 2,
		},
	);
	expect(receipt.lost).toEqual({ connectors: 0, groups: 0 });
	expect(receipt.recoveryPath).toBeNull();
	expect(await host.kindOf(".vaultops/recovery")).toBeNull();
});

it("undoes a move: both files come back exactly, connectors and group included", async () => {
	const host = new MemoryHost();
	await host.writeTextAtomic("canvas.vnote", serializeNote(withStructure()));
	await host.writeTextAtomic(
		"note.vnote",
		serializeNote({ ...doc("note"), blocks: [] }),
	);
	const canvasBefore = await host.readText("canvas.vnote");
	const noteBefore = await host.readText("note.vnote");
	const receipt = await moveBlock(host, "canvas.vnote", "note.vnote", "a", {
		after: null,
	});
	expect(await host.readText("canvas.vnote")).not.toBe(canvasBefore);
	await undoMove(host, receipt);
	expect(await host.readText("canvas.vnote")).toBe(canvasBefore);
	expect(await host.readText("note.vnote")).toBe(noteBefore);
});

it("refuses to undo once either file has changed, and changes nothing", async () => {
	const host = new MemoryHost();
	await host.writeTextAtomic("source.vnote", serializeNote(doc("source")));
	await host.writeTextAtomic(
		"canvas.vnote",
		serializeNote(doc("canvas", true)),
	);
	const receipt = await moveBlock(
		host,
		"source.vnote",
		"canvas.vnote",
		"block",
		{
			x: 1,
			y: 2,
		},
	);
	const edited = `${receipt.sourceAfter}`.replace(
		'"noteId":"source"',
		'"noteId":"source","title":"Edited"',
	);
	await host.writeTextAtomic("source.vnote", edited);
	await expect(undoMove(host, receipt)).rejects.toThrow("can't be undone here");
	expect(await host.readText("source.vnote")).toBe(edited);
	expect(await host.readText("canvas.vnote")).toBe(receipt.destinationAfter);
});

it("runs two moves on the same file one after the other", async () => {
	const host = new MemoryHost();
	const note = doc("source");
	note.blocks = [
		{ id: "one", type: "paragraph", parent: null },
		{ id: "two", type: "paragraph", parent: null },
	];
	await host.writeTextAtomic("source.vnote", serializeNote(note));
	await host.writeTextAtomic(
		"canvas.vnote",
		serializeNote(doc("canvas", true)),
	);
	await Promise.all([
		moveBlock(host, "source.vnote", "canvas.vnote", "one", { x: 1, y: 1 }),
		moveBlock(host, "source.vnote", "canvas.vnote", "two", { x: 2, y: 2 }),
	]);
	expect(parseNote(await host.readText("source.vnote")).note?.blocks).toEqual(
		[],
	);
	expect(
		parseNote(await host.readText("canvas.vnote")).note?.blocks.map(
			(b) => b.id,
		),
	).toEqual(["one", "two"]);
});

it("sends a card to a canvas with no spot named: beside the cards already there, or the corner when empty", async () => {
	const host = new MemoryHost();
	const from = doc("from", true);
	from.blocks = [
		{
			id: "card",
			type: "paragraph",
			parent: null,
			attrs: { x: 500, y: 500 },
			content: [{ type: "text", text: "Hi" }],
		},
		{
			id: "card2",
			type: "paragraph",
			parent: null,
			attrs: { x: 9, y: 9 },
		},
	];
	const to = doc("to", true);
	to.blocks = [
		{ id: "a", type: "paragraph", parent: null, attrs: { x: 100, y: 80 } },
		{ id: "b", type: "paragraph", parent: null, attrs: { x: 300, y: 20 } },
	];
	await host.writeTextAtomic("from.vnote", serializeNote(from));
	await host.writeTextAtomic("to.vnote", serializeNote(to));
	await host.writeTextAtomic("empty.vnote", serializeNote(doc("empty", true)));
	await moveBlock(host, "from.vnote", "to.vnote", "card", { after: null });
	const placed = parseNote(await host.readText("to.vnote")).note?.blocks.at(-1);
	expect(placed?.id).toBe("card");
	expect(placed?.attrs).toMatchObject({ x: 560, y: 20 });
	await moveBlock(host, "from.vnote", "empty.vnote", "card2", { after: null });
	expect(
		parseNote(await host.readText("empty.vnote")).note?.blocks[0]?.attrs,
	).toMatchObject({ x: 40, y: 40 });
});
