import { expect, it, vi } from "vitest";
import { type Note, serializeNote } from "../core/note-format";
import { scanVault } from "../core/notes/scan";
import { MemoryHost } from "../host/memory-host";
import { createLiveDocuments } from "./live-documents";

const path = "First.vnote";
const note: Note = {
	header: { format: "vaultops-note", v: 1, noteId: "one", title: "First" },
	blocks: [{ id: "p", type: "paragraph", parent: null }],
};
const diskText = `\uFEFF${serializeNote(note).replaceAll("\n", "\r\n")}`;
const notes = [{ path, id: "one", readOnly: false }];

it("shares a read and snapshot between path and ID subscribers", async () => {
	const host = { readText: vi.fn(async () => diskText) };
	const live = createLiveDocuments(host, { notes, writable: true });
	const byPath = live.subscribe({ path });
	const byId = live.subscribe({ noteId: "one" });
	const [first, second] = await Promise.all([byPath.ready, byId.ready]);
	expect(first).toBe(second);
	expect(first).toEqual({
		path,
		noteId: "one",
		kind: "note",
		readOnly: false,
		base: note,
		diskText,
		draft: note,
		revision: 0,
		saveStatus: { kind: "saved" },
		editorOwner: null,
	});
	expect(host.readText).toHaveBeenCalledExactlyOnceWith(path);
	byPath.unsubscribe();
	byId.unsubscribe();
	await live.subscribe({ path }).ready;
	expect(host.readText).toHaveBeenCalledTimes(2);
});

it("keeps duplicate IDs unresolved, including a copy with a damaged body", async () => {
	const host = new MemoryHost();
	await host.writeTextAtomic(path, diskText);
	await host.writeTextAtomic("Copy.vnote", `${diskText}{\n`);
	const { notes: scanned } = await scanVault(host);
	const read = vi.spyOn(host, "readText");
	const live = createLiveDocuments(host, {
		notes: scanned.map(({ note, path, readOnly }) => ({
			id: note.header.noteId,
			path,
			readOnly,
		})),
		writable: true,
	});
	expect(await live.subscribe({ noteId: "one" }).ready).toBeNull();
	expect(read).not.toHaveBeenCalled();
	for (const path of ["First.vnote", "Copy.vnote"]) {
		expect(await live.subscribe({ path }).ready).toMatchObject({
			noteId: null,
			readOnly: true,
		});
	}
});

it.each([
	[`${diskText}{\n`, note],
	["unreadable header", null],
	[
		diskText.replace('"v":1', '"v":2'),
		{ ...note, header: { ...note.header, v: 2 } },
	],
])("opens damaged bytes read-only by path", async (text, draft) => {
	const host = { readText: vi.fn(async () => text) };
	const live = createLiveDocuments(host, { notes, writable: true });
	const byPath = live.subscribe({ path });
	const byId = live.subscribe({ noteId: "one" });
	expect(await byPath.ready).toMatchObject({
		noteId: null,
		readOnly: true,
		base: null,
		diskText: text,
		draft,
	});
	expect(await byId.ready).toBeNull();
	expect(host.readText).toHaveBeenCalledTimes(1);
	expect(byPath.updateDraft(note)).toBe(false);
	expect(byPath.setEditorOwner(true)).toBe(false);
});

it("requires the on-disk ID to match the indexed path", async () => {
	const host = { readText: async () => diskText.replace('"one"', '"two"') };
	const live = createLiveDocuments(host, { notes, writable: true });
	expect(await live.subscribe({ noteId: "one" }).ready).toBeNull();
	expect(await live.subscribe({ noteId: "two" }).ready).toBeNull();
	expect(await live.subscribe({ path }).ready).toMatchObject({
		noteId: null,
		readOnly: true,
	});
});

it("discards pending reads across vault generations, even for the same ID and path", async () => {
	let finishOld!: (text: string) => void;
	const old = new Promise<string>((resolve) => {
		finishOld = resolve;
	});
	const host = { readText: vi.fn(() => old) };
	const first = createLiveDocuments(host, { notes, writable: true });
	const pending = first.subscribe({ path });
	first.dispose();
	const freshText = diskText.replaceAll("First", "New vault");
	host.readText.mockResolvedValue(freshText);
	const second = createLiveDocuments(host, { notes, writable: true });
	const fresh = second.subscribe({ noteId: "one" });
	finishOld(diskText);
	expect(await pending.ready).toBeNull();
	expect(await first.subscribe({ path }).ready).toBeNull();
	expect(await fresh.ready).toMatchObject({ diskText: freshText });
	expect(host.readText).toHaveBeenCalledTimes(2);
});

it("retries a failed read and lets a subscriber leave before a read finishes", async () => {
	const host = { readText: vi.fn(async () => diskText) };
	host.readText.mockRejectedValueOnce(new Error("read failed"));
	const live = createLiveDocuments(host, { notes, writable: true });
	await expect(live.subscribe({ path }).ready).rejects.toThrow("read failed");
	const leaving = live.subscribe({ path });
	const staying = live.subscribe({ noteId: "one" });
	leaving.unsubscribe();
	expect(await leaving.ready).toBeNull();
	expect(await staying.ready).toMatchObject({ noteId: "one" });
	expect(host.readText).toHaveBeenCalledTimes(2);
});

it("retains a detached draft and clears its editor owner when the owner leaves", async () => {
	const host = { readText: vi.fn(async () => diskText) };
	const live = createLiveDocuments(host, { notes, writable: true });
	const observe = vi.fn();
	const editing = live.subscribe({ path });
	const watching = live.subscribe({ path }, observe);
	await watching.ready;
	expect(editing.setEditorOwner(true)).toBe(true);
	expect(watching.setEditorOwner(true)).toBe(false);
	const draft = { ...note, header: { ...note.header, title: "Latest" } };
	expect(editing.updateDraft(draft)).toBe(true);
	expect(observe).toHaveBeenLastCalledWith(
		expect.objectContaining({
			draft,
			revision: 1,
			saveStatus: { kind: "dirty" },
			editorOwner: expect.any(Symbol),
		}),
	);
	editing.unsubscribe();
	expect(observe).toHaveBeenLastCalledWith(
		expect.objectContaining({ editorOwner: null }),
	);
	watching.unsubscribe();
	expect(await live.subscribe({ path }).ready).toMatchObject({
		draft,
		base: note,
		diskText,
	});
	expect(host.readText).toHaveBeenCalledTimes(1);
});

it("tracks canvases and respects a read-only vault", async () => {
	const canvas = { ...note, header: { ...note.header, kind: "canvas" } };
	const host = { readText: async () => serializeNote(canvas) };
	const live = createLiveDocuments(host, { notes, writable: false });
	const subscription = live.subscribe({ noteId: "one" });
	expect(await subscription.ready).toMatchObject({
		kind: "canvas",
		noteId: "one",
		readOnly: true,
		base: canvas,
	});
	expect(subscription.updateDraft(canvas)).toBe(false);
});
