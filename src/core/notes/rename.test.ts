import { describe, expect, it, vi } from "vitest";
import { HostError } from "../../host/host";
import { MemoryHost } from "../../host/memory-host";
import type { Note } from "../note-format";
import { openVault } from "../vault/vault";
import { moveNote, renameNote } from "./rename";
import { createNote, loadNote, saveNote } from "./repository";

async function vault() {
	const host = new MemoryHost();
	await openVault(host);
	return host;
}

async function noteWithBlock(host: MemoryHost, folder: string, title: string) {
	const made = await createNote(host, folder, title);
	const note: Note = {
		...made.note,
		blocks: [
			{
				id: "b1",
				type: "paragraph",
				parent: null,
				content: [{ type: "text", text: "Body stays" }],
			},
		],
	};
	await saveNote(host, made.path, note);
	return { path: made.path, note };
}

describe("renameNote", () => {
	it("renames the file, keeps noteId and blocks, and saves the new title", async () => {
		const host = await vault();
		const { path, note } = await noteWithBlock(host, "", "Old");
		const result = await renameNote(host, path, note, "New title");
		expect(result).toEqual({ path: "New title.vnote", renamed: true });
		expect(await host.kindOf("Old.vnote")).toBeNull();
		const loaded = (await loadNote(host, "New title.vnote")).note;
		expect(loaded?.header.title).toBe("New title");
		expect(loaded?.header.noteId).toBe(note.header.noteId);
		expect(loaded?.blocks).toEqual(note.blocks);
	});

	it("renames when only capital letters change", async () => {
		const host = await vault();
		const { path, note } = await noteWithBlock(host, "", "note");
		const result = await renameNote(host, path, note, "Note");
		expect(result).toEqual({ path: "Note.vnote", renamed: true });
		expect((await host.list("")).map((e) => e.name)).toContain("Note.vnote");
		expect((await host.list("")).map((e) => e.name)).not.toContain(
			"note.vnote",
		);
	});

	it("gives a clash with another note ' 2', then ' 3'", async () => {
		const host = await vault();
		await createNote(host, "", "Plan");
		await createNote(host, "", "plan 2");
		const { path, note } = await noteWithBlock(host, "", "Draft");
		const result = await renameNote(host, path, note, "plan");
		expect(result.path).toBe("plan 3.vnote");
		expect(result.renamed).toBe(true);
	});

	it("does nothing to the file when the name would not change", async () => {
		const host = await vault();
		const { path, note } = await noteWithBlock(host, "", "Same");
		const move = vi.spyOn(host, "move");
		expect(await renameNote(host, path, note, "Same")).toEqual({
			path,
			renamed: false,
		});
		expect(move).not.toHaveBeenCalled();
	});

	it("keeps the new title and the old file name when the move fails, and says so", async () => {
		const host = await vault();
		const { path, note } = await noteWithBlock(host, "", "Before");
		vi.spyOn(host, "move").mockRejectedValue(new HostError("io", "disk busy"));
		const result = await renameNote(host, path, note, "After");
		expect(result.renamed).toBe(false);
		expect(result.path).toBe("Before.vnote");
		expect(result.notice).toContain("title was saved");
		expect(result.notice).toContain("disk busy");
		const loaded = (await loadNote(host, "Before.vnote")).note;
		expect(loaded?.header.title).toBe("After");
		expect(loaded?.blocks).toEqual(note.blocks);
	});

	it("writes nothing for a read-only note", async () => {
		const host = await vault();
		const { path, note } = await noteWithBlock(host, "", "Locked");
		const write = vi.spyOn(host, "writeTextAtomic");
		const move = vi.spyOn(host, "move");
		const result = await renameNote(host, path, note, "Other", {
			readOnly: true,
		});
		expect(result.renamed).toBe(false);
		expect(result.notice).toContain("read-only");
		expect(write).not.toHaveBeenCalled();
		expect(move).not.toHaveBeenCalled();
	});

	it("does not rename or write when the save guard refuses the note", async () => {
		const host = await vault();
		const { path, note } = await noteWithBlock(host, "", "Bad");
		const broken: Note = {
			...note,
			blocks: [...note.blocks, { type: "paragraph", parent: null }],
		};
		const before = await host.readText(path);
		const move = vi.spyOn(host, "move");
		const result = await renameNote(host, path, broken, "Worse");
		expect(result.renamed).toBe(false);
		expect(result.notice).toContain("not saved");
		expect(await host.readText(path)).toBe(before);
		expect(move).not.toHaveBeenCalled();
	});

	it("works inside a folder", async () => {
		const host = await vault();
		await host.makeFolder("School");
		const { path, note } = await noteWithBlock(host, "School", "Math");
		const result = await renameNote(host, path, note, "Algebra");
		expect(result.path).toBe("School/Algebra.vnote");
	});
});

describe("moveNote", () => {
	it("moves into another folder keeping name, noteId and content", async () => {
		const host = await vault();
		await host.makeFolder("Archive");
		const { path, note } = await noteWithBlock(host, "", "Keep");
		const result = await moveNote(host, path, "Archive");
		expect(result).toEqual({ path: "Archive/Keep.vnote", moved: true });
		const loaded = (await loadNote(host, "Archive/Keep.vnote")).note;
		expect(loaded?.header.noteId).toBe(note.header.noteId);
		expect(loaded?.blocks).toEqual(note.blocks);
		expect(await host.kindOf("Keep.vnote")).toBeNull();
	});

	it("takes the next free name when the destination has the same one", async () => {
		const host = await vault();
		await host.makeFolder("Archive");
		await createNote(host, "Archive", "Keep");
		const { path } = await noteWithBlock(host, "", "keep");
		const result = await moveNote(host, path, "Archive");
		expect(result.path).toBe("Archive/keep 2.vnote");
		expect(result.moved).toBe(true);
	});

	it("moves a note back to the vault root", async () => {
		const host = await vault();
		await host.makeFolder("Archive");
		const { path } = await noteWithBlock(host, "Archive", "Back");
		expect((await moveNote(host, path, "")).path).toBe("Back.vnote");
	});

	it("refuses a destination inside .vaultops with no writes", async () => {
		const host = await vault();
		const { path } = await noteWithBlock(host, "", "Stay");
		const write = vi.spyOn(host, "writeTextAtomic");
		const move = vi.spyOn(host, "move");
		for (const folder of [".vaultops", ".vaultops/trash", ".VaultOps/index"]) {
			const result = await moveNote(host, path, folder);
			expect(result.moved).toBe(false);
			expect(result.path).toBe(path);
		}
		expect(write).not.toHaveBeenCalled();
		expect(move).not.toHaveBeenCalled();
	});

	it("refuses a read-only note and a missing folder", async () => {
		const host = await vault();
		await host.makeFolder("Archive");
		const { path } = await noteWithBlock(host, "", "Fixed");
		const move = vi.spyOn(host, "move");
		expect(await moveNote(host, path, "Archive", { readOnly: true })).toEqual({
			path,
			moved: false,
			notice: expect.stringContaining("read-only"),
		});
		expect((await moveNote(host, path, "Nowhere")).moved).toBe(false);
		expect(move).not.toHaveBeenCalled();
	});

	it("reports a failed move and leaves the note where it was", async () => {
		const host = await vault();
		await host.makeFolder("Archive");
		const { path } = await noteWithBlock(host, "", "Stuck");
		vi.spyOn(host, "move").mockRejectedValue(new HostError("io", "disk busy"));
		const result = await moveNote(host, path, "Archive");
		expect(result.moved).toBe(false);
		expect(result.notice).toContain("disk busy");
	});
});
