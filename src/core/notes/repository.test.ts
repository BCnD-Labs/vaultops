import { describe, expect, it, vi } from "vitest";
import { HostError } from "../../host/host";
import { MemoryHost } from "../../host/memory-host";
import { NOTE_FORMAT, NOTE_FORMAT_VERSION, parseNote } from "../note-format";
import { openVault } from "../vault/vault";
import { moveNote, renameNote } from "./rename";
import {
	createCanvas,
	createNote,
	listNotes,
	loadNote,
	saveNote,
} from "./repository";
import { listTrash, trashNote } from "./trash";

describe("note repository", () => {
	it("creates canvases with the same collision rules and keeps kind on save", async () => {
		const host = new MemoryHost();
		const first = await createCanvas(host, "", "Ideas");
		const second = await createCanvas(host, "", "Ideas");
		expect([first.path, second.path]).toEqual(["Ideas.vnote", "Ideas 2.vnote"]);
		expect(first.note.header.kind).toBe("canvas");
		expect(first.note.blocks).toEqual([]);
		first.note.blocks.push({
			id: "b",
			type: "paragraph",
			parent: null,
			attrs: { x: 1, y: 2 },
		});
		expect((await saveNote(host, first.path, first.note)).ok).toBe(true);
		expect((await loadNote(host, first.path)).note).toEqual(first.note);
	});
	it("renames, moves and trashes a canvas through the note operations", async () => {
		const host = new MemoryHost();
		await openVault(host);
		await host.makeFolder("Boards");
		const made = await createCanvas(host, "", "Ideas");
		const renamed = await renameNote(host, made.path, made.note, "Plans");
		const moved = await moveNote(host, renamed.path, "Boards");
		expect(moved.path).toBe("Boards/Plans.vnote");
		expect((await loadNote(host, moved.path)).note?.header.kind).toBe("canvas");
		await trashNote(host, moved.path);
		expect((await listTrash(host))[0]?.originalPath).toBe(moved.path);
	});
	it("creates, saves and reloads an equal note without adding history", async () => {
		const host = new MemoryHost();
		await openVault(host);
		const write = vi.spyOn(host, "writeTextAtomic");
		const { path, note } = await createNote(host);
		expect(path).toBe("Untitled.vnote");
		expect(note).toEqual({
			header: {
				format: NOTE_FORMAT,
				v: NOTE_FORMAT_VERSION,
				noteId: expect.stringMatching(
					/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
				),
				title: "Untitled",
			},
			blocks: [{ id: expect.any(String), type: "paragraph", parent: null }],
		});
		expect(write).toHaveBeenCalledTimes(2);
		expect(write.mock.calls[1]?.[0]).toBe(path);
		expect(await host.list(".vaultops/history")).toEqual([]);
		expect(await host.list(".vaultops/pending")).toHaveLength(1);

		note.blocks.push({
			id: "block-1",
			type: "paragraph",
			parent: null,
			content: [{ type: "text", text: "Keep this text" }],
		});
		expect((await saveNote(host, path, note)).ok).toBe(true);
		expect(await loadNote(host, path)).toEqual({
			note,
			problems: [],
			skippedLines: [],
		});
	});

	it("keeps the exact title but cleans its file name in the chosen folder", async () => {
		const host = new MemoryHost();
		await host.makeFolder("notes");
		const { path, note } = await createNote(host, "notes", "a/b");
		expect(path).toBe("notes/a-b.vnote");
		expect(note.header["title"]).toBe("a/b");
		expect((await loadNote(host, path)).note).toEqual(note);
	});

	it("avoids existing files and folders using the shared filename rules", async () => {
		const host = new MemoryHost();
		const first = await createNote(host, "", "Note");
		const second = await createNote(host, "", "Note");
		expect([first.path, second.path]).toEqual(["Note.vnote", "Note 2.vnote"]);
		expect(first.note.header.noteId).not.toBe(second.note.header.noteId);
		await host.makeFolder("Note 3.vnote");
		expect((await createNote(host, "", "note")).path).toBe("note 4.vnote");
		expect((await loadNote(host, first.path)).note).toEqual(first.note);
	});

	it("leaves disk bytes and the supplied note untouched when save is refused", async () => {
		const host = new MemoryHost();
		const { path, note } = await createNote(host);
		const before = await host.readText(path);
		note.blocks.push(
			{ id: "same", type: "paragraph", parent: null },
			{ id: "same", type: "paragraph", parent: null },
		);
		const input = structuredClone(note);
		const write = vi.spyOn(host, "writeTextAtomic");
		expect(await saveNote(host, path, note)).toEqual({
			ok: false,
			problems: [expect.objectContaining({ kind: "duplicate-id", line: 4 })],
		});
		expect(write).not.toHaveBeenCalled();
		expect(await host.readText(path)).toBe(before);
		expect(note).toEqual(input);
	});

	it.each([
		'{"format":"vaultops-note","v":1,"noteId":"n"}\n{\n{"type":"paragraph","parent":null}\n',
		'{"format":"vaultops-note","v":99,"noteId":"n"}\n',
		"not a note\n",
	])("passes through parsing results without writing: %s", async (text) => {
		const host = new MemoryHost();
		await host.writeTextAtomic("raw.vnote", text);
		const write = vi.spyOn(host, "writeTextAtomic");
		expect(await loadNote(host, "raw.vnote")).toEqual(parseNote(text));
		expect(write).not.toHaveBeenCalled();
		expect(await host.readText("raw.vnote")).toBe(text);
	});

	it("lists only direct note files in name order, excluding vault metadata", async () => {
		const host = new MemoryHost();
		await openVault(host);
		await host.makeFolder("folder.vnote");
		await host.makeFolder("notes/nested");
		for (const path of [
			"z.vnote",
			"a.vnote",
			"other.txt",
			"notes/z.vnote",
			"notes/a.vnote",
			"notes/other.txt",
			"notes/nested/deep.vnote",
			".vaultops/hidden.vnote",
			".vaultops/history/hidden.vnote",
		]) {
			await host.writeTextAtomic(path, "");
		}
		expect(await listNotes(host)).toEqual(["a.vnote", "z.vnote"]);
		expect(await listNotes(host, "notes")).toEqual([
			"notes/a.vnote",
			"notes/z.vnote",
		]);
		const list = vi.spyOn(host, "list");
		for (const folder of [
			".vaultops",
			".vaultops/history",
			".VaultOps/history",
		]) {
			expect(await listNotes(host, folder)).toEqual([]);
		}
		expect(list).not.toHaveBeenCalled();
	});

	it("propagates host errors instead of reporting success", async () => {
		const host = new MemoryHost();
		await expect(createNote(host, "missing")).rejects.toMatchObject({
			code: "not-found",
		});
		await expect(loadNote(host, "missing.vnote")).rejects.toMatchObject({
			code: "not-found",
		});
		await expect(listNotes(host, "../outside")).rejects.toMatchObject({
			code: "invalid-path",
		});
		const { path, note } = await createNote(host);
		const error = new HostError("io", "write failed");
		vi.spyOn(host, "writeTextAtomic").mockRejectedValue(error);
		await expect(saveNote(host, path, note)).rejects.toBe(error);
	});

	it("refuses to create a note inside .vaultops, in any letter case, without writing", async () => {
		const host = new MemoryHost();
		await openVault(host);
		const write = vi.spyOn(host, "writeTextAtomic");
		for (const folder of [
			".vaultops",
			".vaultops/sub",
			".VAULTOPS",
			".VaultOps/deep/er",
		]) {
			await expect(createNote(host, folder)).rejects.toThrow(".vaultops");
		}
		expect(write).not.toHaveBeenCalled();
	});

	it("still creates notes in normal folders, including ones that only look similar", async () => {
		const host = new MemoryHost();
		await openVault(host);
		await host.makeFolder("Projects");
		await host.makeFolder("vaultops-notes");
		expect((await createNote(host, "Projects")).path).toBe(
			"Projects/Untitled.vnote",
		);
		expect((await createNote(host, "vaultops-notes")).path).toBe(
			"vaultops-notes/Untitled.vnote",
		);
	});

	it("lists .vnote files whatever the letter case of the ending", async () => {
		const host = new MemoryHost();
		await openVault(host);
		for (const name of [
			"a.vnote",
			"B.VNOTE",
			"c.VNote",
			"d.vnote.txt",
			"e.vnot",
			"f.txt",
		]) {
			await host.writeTextAtomic(name, "x");
		}
		expect(await listNotes(host)).toEqual(["B.VNOTE", "a.vnote", "c.VNote"]);
	});
});
