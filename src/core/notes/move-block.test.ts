import { mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { MemoryHost } from "../../host/memory-host";
import { type Note, parseNote, serializeNote } from "../note-format";
import { moveBlock } from "./move-block";
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

it("writes destination first and leaves both copies when the source write fails", async () => {
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
	).rejects.toThrow("canvas.vnote, but could not be removed from source.vnote");
	expect(write.mock.calls.map(([path]) => path)).toEqual([
		"canvas.vnote",
		"source.vnote",
	]);
	expect(await host.readText("source.vnote")).toBe(original);
	expect(
		parseNote(await host.readText("canvas.vnote")).note?.blocks[0],
	).toMatchObject({ id: "block", attrs: { x: 3, y: 4 } });
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
