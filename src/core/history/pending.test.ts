import { describe, expect, it, vi } from "vitest";
import { lockedForReadOnlyVault, openNote } from "../../editor/note-io";
import { saveAsCopy, saveDraft } from "../../editor/save-draft";
import { MemoryHost } from "../../host/memory-host";
import { readOnlyHost } from "../../host/read-only-host";
import {
	type Block,
	type Note,
	serializeBlock,
	serializeNote,
} from "../note-format";
import { createNote } from "../notes/repository";
import { scanVault } from "../notes/scan";
import { buildTree } from "../notes/tree";
import {
	listChanges,
	readPending,
	updatePending,
	writePending,
} from "./pending";

const block = (id = "a", text = "old"): Block => ({
	id,
	type: "paragraph",
	parent: null,
	content: [{ type: "text", text }],
});
const doc = (text: string) => ({
	type: "doc",
	content: [
		{
			type: "paragraph",
			attrs: { id: "a" },
			content: [{ type: "text", text }],
		},
	],
});
async function setup() {
	const host = new MemoryHost();
	const note: Note = {
		header: { format: "vaultops-note", v: 1, noteId: "legacy", title: "Old" },
		blocks: [block()],
	};
	await host.writeTextAtomic("Old.vnote", serializeNote(note));
	return { host, note, opened: await openNote(host, "Old.vnote") };
}

describe("pending changes", () => {
	it("stores only edited blocks with canonical lines, preserves the first before and nets out", () => {
		const old = [block(), block("b")];
		const next = [block("a", "next"), old[1] as Block];
		const pending = updatePending([], old, next);
		expect(pending).toEqual([
			{
				blockId: "a",
				before: serializeBlock(old[0] as Block),
				after: serializeBlock(next[0] as Block),
				anchor: null,
			},
		]);
		const twice = updatePending(pending, next, [
			block("a", "twice"),
			old[1] as Block,
		]);
		expect(twice[0]?.before).toBe(pending[0]?.before);
		expect(
			updatePending(twice, [block("a", "twice"), old[1] as Block], old),
		).toEqual([]);
		expect(pending[0]?.after).toBe(serializeBlock(next[0] as Block));
	});

	it("lists new, deleted (with predecessor), retyped and changed blocks", async () => {
		const host = new MemoryHost();
		const old = [block("a"), block("b"), block("c"), block("d")];
		const next = [
			block("a", "edited"),
			{ ...block("c"), type: "heading" },
			block("d"),
			block("e"),
		];
		await writePending(host, "n", updatePending([], old, next));
		const changes = await listChanges(host, "n", next);
		expect(
			changes.map((entry) => [entry.blockId, entry.kind, entry.anchor]),
		).toEqual([
			["a", "changed", null],
			["b", "deleted", "a"],
			["c", "retyped", "b"],
			["e", "new", null],
		]);
		expect(changes.find((entry) => entry.blockId === "b")?.after).toBeNull();
		expect(changes.find((entry) => entry.blockId === "e")?.before).toBeNull();
		expect(updatePending([], old, [...old].reverse())).toEqual([]);
		expect(updatePending(updatePending([], old, []), [], old)).toEqual([]);
		expect(updatePending(updatePending([], [], old), old, [])).toEqual([]);
	});

	it("typing then undoing removes the pending file", async () => {
		const { host, opened } = await setup();
		expect(
			(await saveDraft(host, opened, { title: "Old", doc: doc("typed") })).ok,
		).toBe(true);
		expect(
			(
				await saveDraft(host, await openNote(host, opened.path), {
					title: "Old",
					doc: doc("old"),
				})
			).ok,
		).toBe(true);
		expect(await host.kindOf(".vaultops/pending/legacy.jsonl")).toBeNull();
		expect(await readPending(host, "legacy")).toEqual([]);
	});

	it("creates a new first block and copies all blocks as new without sharing pending", async () => {
		const { host, opened } = await setup();
		const created = await createNote(host);
		expect(
			await listChanges(host, created.note.header.noteId, created.note.blocks),
		).toMatchObject([{ kind: "new", before: null }]);
		await saveDraft(host, opened, { title: "Old", doc: doc("edited") });
		const original = await readPending(host, "legacy");
		const copy = await saveAsCopy(host, opened, {
			title: "Old",
			doc: doc("copy"),
		});
		if (!copy.ok) throw new Error(copy.message);
		const copied = await openNote(host, copy.path);
		if (!copied.note) throw new Error("missing copy");
		expect(
			await listChanges(host, copied.note.header.noteId, copied.note.blocks),
		).toMatchObject([{ kind: "new", before: null }]);
		expect(await readPending(host, "legacy")).toEqual(original);
	});
	it.todo("V2: committing new blocks makes them stop being new");

	it("keeps pending through title rename and move, hidden from scans and tree", async () => {
		const { host, opened } = await setup();
		const saved = await saveDraft(host, opened, {
			title: "New",
			doc: doc("edited"),
		});
		if (!saved.ok) throw new Error(saved.message);
		await host.makeFolder("folder");
		await host.move(saved.path, "folder/New.vnote");
		expect(await readPending(host, "legacy")).toHaveLength(1);
		const scan = await scanVault(host);
		expect(scan.notes.map((entry) => entry.path)).toEqual(["folder/New.vnote"]);
		expect(scan.folders).toEqual(["folder"]);
		expect(buildTree(scan.folders, [])).toHaveLength(1);
	});

	it.each(["guard", "conflict", "locked", "read-only host"])(
		"%s saves leave pending and notes untouched",
		async (reason) => {
			const { host, opened } = await setup();
			if (reason === "conflict")
				await host.writeTextAtomic(opened.path, "external");
			const before = await host.readText(opened.path);
			const write = vi.spyOn(host, "writeTextAtomic");
			const draftDoc = doc("edited");
			if (reason === "guard")
				draftDoc.content.push(...doc("duplicate").content);
			const result = await saveDraft(
				reason === "read-only host" ? readOnlyHost(host) : host,
				reason === "locked" ? lockedForReadOnlyVault(opened) : opened,
				{ title: "Old", doc: draftDoc },
			);
			expect(result.ok).toBe(false);
			expect(write).not.toHaveBeenCalled();
			expect(await readPending(host, "legacy")).toEqual([]);
			expect(await host.readText(opened.path)).toBe(before);
		},
	);

	it.each(["pending", "note"])(
		"a failed %s write fails the save without stray pending",
		async (failure) => {
			const { host, opened } = await setup();
			const before = await host.readText(opened.path);
			const write = host.writeTextAtomic.bind(host);
			vi.spyOn(host, "writeTextAtomic").mockImplementation(
				async (path, text) => {
					if (
						failure === "pending"
							? path.endsWith(".jsonl")
							: path === opened.path
					)
						throw new Error("disk full");
					await write(path, text);
				},
			);
			expect(
				await saveDraft(host, opened, { title: "Old", doc: doc("edited") }),
			).toMatchObject({ ok: false, message: "disk full" });
			expect(await host.readText(opened.path)).toBe(before);
			expect(await readPending(host, "legacy")).toEqual([]);
		},
	);

	it.each(["note", "cleanup"])(
		"restores existing pending after a failed %s during undo",
		async (failure) => {
			const { host, opened } = await setup();
			await saveDraft(host, opened, { title: "Old", doc: doc("edited") });
			const previous = await readPending(host, "legacy");
			const before = await host.readText(opened.path);
			if (failure === "note")
				vi.spyOn(host, "writeTextAtomic").mockRejectedValueOnce(
					new Error("note failed"),
				);
			else
				vi.spyOn(host, "removeTrashed").mockRejectedValueOnce(
					new Error("cleanup failed"),
				);
			expect(
				(
					await saveDraft(host, await openNote(host, opened.path), {
						title: "Old",
						doc: doc("old"),
					})
				).ok,
			).toBe(false);
			expect(await readPending(host, "legacy")).toEqual(previous);
			expect(await host.readText(opened.path)).toBe(before);
		},
	);

	it("measures one edit in a 1,000-block note without a timing gate", () => {
		const old = Array.from({ length: 1000 }, (_, i) => block(String(i)));
		const next = old.map((b, i) => (i === 500 ? { ...b, content: [] } : b));
		const start = performance.now();
		const pending = updatePending([], old, next);
		console.info(
			`1,000-block pending update: ${(performance.now() - start).toFixed(2)} ms`,
		);
		expect(pending).toHaveLength(1);
	});
});
