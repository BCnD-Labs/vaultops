import { describe, expect, it } from "vitest";
import { createFolder, moveFolder, renameFolder } from "../core/notes/folders";
import { moveNote, renameNote } from "../core/notes/rename";
import { createNote, saveNote } from "../core/notes/repository";
import {
	deleteForever,
	restoreNote,
	trashFolder,
	trashNote,
} from "../core/notes/trash";
import { lockedForReadOnlyVault, openNote, saveDoc } from "../editor/note-io";
import { saveAsCopy, saveDraft } from "../editor/save-draft";
import { MemoryHost } from "../host/memory-host";
import { readOnlyHost } from "../host/read-only-host";
import { createAndLoad, loadVault, newNote } from "./session";

/** A MemoryHost that remembers every call that would change the vault. */
class CountingHost extends MemoryHost {
	writes: string[] = [];
	async writeTextAtomic(path: string, text: string) {
		this.writes.push(`writeTextAtomic ${path}`);
		return super.writeTextAtomic(path, text);
	}
	async move(from: string, to: string) {
		this.writes.push(`move ${from} -> ${to}`);
		return super.move(from, to);
	}
	async makeFolder(path: string) {
		this.writes.push(`makeFolder ${path}`);
		return super.makeFolder(path);
	}
	async removeTrashed(path: string) {
		this.writes.push(`removeTrashed ${path}`);
		return super.removeTrashed(path);
	}
}

/** A vault written by a newer app version: notes, a folder, one trashed note. */
async function newerVault() {
	const host = new CountingHost();
	await loadVault(host);
	const alpha = await createNote(host, "", "Alpha");
	await createFolder(host, "", "Class");
	await createNote(host, "Class", "Lecture");
	const gone = await createNote(host, "", "Gone");
	const { trashPath } = await trashNote(host, gone.path);
	await host.writeTextAtomic(".vaultops/config.json", '{"formatVersion": 2}\n');
	host.writes.length = 0;
	return { host, alphaPath: alpha.path, trashPath };
}

describe("a vault from a newer version is read-only", () => {
	it("opens read-only, lists its notes, and writes nothing while loading", async () => {
		const { host } = await newerVault();
		const view = await loadVault(host);
		expect(view).toMatchObject({ status: "read-only", writable: false });
		expect(view.messages.join(" ")).toMatch(/read-only/);
		expect(view.notes.map((n) => n.path).sort()).toEqual([
			"Alpha.vnote",
			"Class/Lecture.vnote",
		]);
		expect(host.writes).toEqual([]);
	});

	it("lets no write reach the host, whichever core function tries", async () => {
		const { host, alphaPath, trashPath } = await newerVault();
		const view = await loadVault(host);
		const guarded = readOnlyHost(host);
		const before = await host.readText(alphaPath);

		const opened = lockedForReadOnlyVault(await openNote(guarded, alphaPath));
		expect(opened.editable).toBe(false);
		const draft = { doc: opened.doc, title: "Changed" };
		const note = opened.note;
		if (!note) throw new Error("fixture note must parse");

		// These report a refusal in their result...
		expect((await saveDraft(guarded, opened, draft)).ok).toBe(false);
		expect((await saveDoc(guarded, opened, opened.doc)).ok).toBe(false);
		expect((await saveAsCopy(guarded, opened, draft)).ok).toBe(false);
		expect((await renameFolder(guarded, "Class", "Renamed")).changed).toBe(
			false,
		);
		expect((await createFolder(guarded, "", "Fresh")).changed).toBe(false);
		expect((await moveFolder(guarded, "Class", "")).changed).toBe(false);
		expect((await moveNote(guarded, alphaPath, "Class")).moved).toBe(false);
		expect(await newNote(guarded, view)).toBe(view);
		expect((await createAndLoad(guarded, view)).path).toBeNull();

		// ...and these throw.
		const throwing = [
			createNote(guarded, "", "New"),
			saveNote(guarded, alphaPath, note),
			renameNote(guarded, alphaPath, note, "Renamed"),
			trashNote(guarded, alphaPath),
			trashFolder(guarded, "Class"),
			restoreNote(guarded, trashPath),
			deleteForever(guarded, trashPath),
		];
		for (const call of throwing) await expect(call).rejects.toThrow();

		expect(host.writes).toEqual([]);
		expect(await host.readText(alphaPath)).toBe(before);
	});

	it("also refuses to save a locked note when no wrapper is in the way", async () => {
		const { host, alphaPath } = await newerVault();
		const opened = lockedForReadOnlyVault(await openNote(host, alphaPath));
		const result = await saveDraft(host, opened, {
			doc: opened.doc,
			title: "Changed",
		});
		expect(result).toMatchObject({ ok: false });
		expect(host.writes).toEqual([]);
	});

	it("keeps a note's own reason for being read-only", () => {
		const own = {
			path: "a.vnote",
			note: null,
			doc: { type: "doc" },
			editable: true,
			baseText: null,
			notice: "Written by a newer version.",
		};
		expect(lockedForReadOnlyVault(own)).toMatchObject({
			editable: false,
			notice: "Written by a newer version.",
		});
	});

	it("control: the same calls do write when the vault is writable", async () => {
		const host = new CountingHost();
		const view = await loadVault(host);
		expect(view.writable).toBe(true);
		host.writes.length = 0;
		await createFolder(host, "", "Fresh");
		await createNote(host, "", "New");
		expect(host.writes.length).toBeGreaterThanOrEqual(2);
	});
});
