import { describe, expect, it, vi } from "vitest";
import { type Note, serializeNote } from "../core/note-format";
import { createNote, saveNote } from "../core/notes/repository";
import { openVault } from "../core/vault/vault";
import { HostError } from "../host/host";
import { MemoryHost } from "../host/memory-host";
import { openNote, saveDoc } from "./note-io";

const text = (value: string) => [{ type: "text", text: value }] as never;

async function withNote(
	blocks: Note["blocks"],
	header: Record<string, unknown> = {},
) {
	const host = new MemoryHost();
	await openVault(host);
	const { path, note } = await createNote(host, "", "Sample");
	const full: Note = {
		header: { ...note.header, ...header } as Note["header"],
		blocks,
	};
	await saveNote(host, path, full);
	return { host, path, note: full };
}

const BLOCKS: Note["blocks"] = [
	{
		id: "h",
		type: "heading",
		parent: null,
		attrs: { level: 2 },
		content: text("Hello"),
	},
	{ id: "ul", type: "bulletList", parent: null },
	{ id: "li", type: "listItem", parent: "ul" },
	{ id: "lp", type: "paragraph", parent: "li", content: text("item") },
	{
		id: "t",
		type: "taskBlock",
		parent: null,
		attrs: { checked: true },
		content: text("done"),
	},
];

describe("open and save in the editor", () => {
	it("opens an understood note as editable and re-saves an unedited one to identical bytes", async () => {
		const { host, path } = await withNote(BLOCKS);
		const before = await host.readText(path);
		const opened = await openNote(host, path);
		expect(opened.editable).toBe(true);
		expect(opened.notice).toBeUndefined();
		const result = await saveDoc(host, opened, opened.doc);
		expect(result.ok).toBe(true);
		expect(await host.readText(path)).toBe(before);
	});

	it("saves an edit, and reloading gives an equal document with the same ids", async () => {
		const { host, path } = await withNote(BLOCKS);
		const opened = await openNote(host, path);
		const edited = structuredClone(opened.doc);
		edited.content?.push({
			type: "paragraph",
			attrs: { id: "new" },
			content: [{ type: "text", text: "added" }],
		});
		expect((await saveDoc(host, opened, edited)).ok).toBe(true);
		const reopened = await openNote(host, path);
		expect(reopened.doc).toEqual(edited);
		expect(reopened.note?.blocks.map((b) => b.id)).toEqual([
			"h",
			"ul",
			"li",
			"lp",
			"t",
			"new",
		]);
		expect(reopened.note?.header).toEqual(opened.note?.header);
	});

	it("keeps unknown header fields on save", async () => {
		const { host, path } = await withNote(BLOCKS, {
			props: { mood: "ok" },
			future: [1, 2],
		});
		const opened = await openNote(host, path);
		await saveDoc(host, opened, opened.doc);
		const header = (await openNote(host, path)).note?.header;
		expect(header?.props).toEqual({ mood: "ok" });
		expect(header?.future).toEqual([1, 2]);
	});

	it("leaves the file untouched when the save guard refuses, and says why", async () => {
		const { host, path } = await withNote(BLOCKS);
		const opened = await openNote(host, path);
		const before = await host.readText(path);
		const write = vi.spyOn(host, "writeTextAtomic");
		const broken = structuredClone(opened.doc);
		broken.content?.push({ type: "paragraph", attrs: { id: "h" } });
		const result = await saveDoc(host, opened, broken);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.message).toContain("duplicate block id h");
		expect(write).not.toHaveBeenCalled();
		expect(await host.readText(path)).toBe(before);
	});

	it("reports a failing host without losing the document or throwing", async () => {
		const { host, path } = await withNote(BLOCKS);
		const opened = await openNote(host, path);
		vi.spyOn(host, "writeTextAtomic").mockRejectedValue(
			new HostError("io", "disk full"),
		);
		const result = await saveDoc(host, opened, opened.doc);
		expect(result).toEqual({ ok: false, message: "disk full" });
	});
});

describe("notes that must not be written", () => {
	async function expectReadOnly(
		host: MemoryHost,
		path: string,
		notice: RegExp,
	) {
		const before = await host.readText(path);
		const write = vi.spyOn(host, "writeTextAtomic");
		const opened = await openNote(host, path);
		expect(opened.editable).toBe(false);
		expect(opened.notice).toMatch(notice);
		const result = await saveDoc(host, opened, opened.doc);
		expect(result.ok).toBe(false);
		expect(write).not.toHaveBeenCalled();
		expect(await host.readText(path)).toBe(before);
	}

	it("a block type from a newer app", async () => {
		const { host, path } = await withNote([
			...BLOCKS,
			{ id: "db", type: "databaseBlock", parent: null },
		]);
		await expectReadOnly(host, path, /databaseBlock/);
	});

	it("an unknown field on a known block", async () => {
		const { host, path } = await withNote([
			{
				id: "a",
				type: "paragraph",
				parent: null,
				due: "2026-11-01",
				content: text("x"),
			},
		]);
		await expectReadOnly(host, path, /due/);
	});

	it("a skipped (unreadable) line", async () => {
		const { host, path, note } = await withNote(BLOCKS);
		await host.writeTextAtomic(path, `${serializeNote(note)}{not json\n`);
		await expectReadOnly(host, path, /could not be read/);
	});

	it("a newer note version", async () => {
		const { host, path } = await withNote(BLOCKS, { v: 2 });
		await expectReadOnly(host, path, /newer version/);
	});

	it("a note with a repeated block id shows read-only", async () => {
		const { host, path, note } = await withNote(BLOCKS);
		const dup = {
			...note,
			blocks: [...note.blocks, { id: "h", type: "paragraph", parent: null }],
		};
		await host.writeTextAtomic(path, serializeNote(dup));
		await expectReadOnly(host, path, /id problems/);
	});

	it("a file with no usable header", async () => {
		const { host, path } = await withNote(BLOCKS);
		await host.writeTextAtomic(path, "hello\n");
		const opened = await openNote(host, path);
		expect(opened.editable).toBe(false);
		expect(opened.note).toBeNull();
		expect((await saveDoc(host, opened, opened.doc)).ok).toBe(false);
	});
});
