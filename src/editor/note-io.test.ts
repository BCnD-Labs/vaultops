import { getSchema, type JSONContent } from "@tiptap/core";
import { EditorState } from "@tiptap/pm/state";
import { describe, expect, it, vi } from "vitest";
import { readPending } from "../core/history/pending";
import { type Note, serializeBlock, serializeNote } from "../core/note-format";
import { createNote, saveNote } from "../core/notes/repository";
import { openVault } from "../core/vault/vault";
import { HostError } from "../host/host";
import { MemoryHost } from "../host/memory-host";
import { createExtensions, INLINE_EXTRA_ATTR } from "./extensions";
import {
	allowEditing,
	lockedForReadOnlyVault,
	openNote,
	saveDoc,
} from "./note-io";
import { saveDraft } from "./save-draft";

const text = (value: string) => [{ type: "text", text: value }] as never;
const INLINE_SAVE_REFUSAL =
	"This edit would remove content from a newer version of the app, so it was not saved. Undo the last change to continue.";

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

function futureBlock(prefix = ""): Note["blocks"][number] {
	return {
		id: "future",
		type: "paragraph",
		parent: null,
		content: [
			...(prefix ? [{ type: "text", text: prefix }] : []),
			{ type: "date", attrs: { date: "2026-11-05", future: { x: 1 } } },
			{
				type: "text",
				text: "marked",
				marks: [{ type: "bold", attrs: { future: [1, 2] } }],
			},
		] as never,
	};
}

describe("open and save in the editor", () => {
	it("keeps future inline attrs when bolding text before their owners", async () => {
		const { host, path } = await withNote([futureBlock("lead target ")]);
		const opened = await openNote(host, path);
		const schema = getSchema(createExtensions());
		const state = EditorState.create({
			schema,
			doc: schema.nodeFromJSON(opened.doc),
		});
		const bold = schema.marks.bold;
		if (!bold) throw new Error("bold mark missing");
		const edited = state
			.apply(state.tr.addMark(1, 5, bold.create()))
			.doc.toJSON();
		const saved = await saveDoc(host, opened, edited);
		expect(saved.ok).toBe(true);
		if (!saved.ok) return;
		const originalContent = JSON.parse(
			serializeBlock(opened.note?.blocks[0] as Note["blocks"][number]),
		).content;
		const savedBlock = saved.note.blocks[0];
		if (!savedBlock) throw new Error("saved block missing");
		const savedContent = JSON.parse(serializeBlock(savedBlock)).content;
		expect(savedContent.slice(2).map(JSON.stringify)).toEqual(
			originalContent.slice(1).map(JSON.stringify),
		);
	});

	it("allows deliberate deletion of a whole block with future inline attrs", async () => {
		const { host, path, note } = await withNote([
			futureBlock(),
			{ id: "keep", type: "paragraph", parent: null, content: text("keep") },
		]);
		const opened = await openNote(host, path);
		const doc = getSchema(createExtensions()).nodeFromJSON(opened.doc).toJSON();
		doc.content.shift();
		const result = await saveDoc(host, opened, doc);
		expect(result.ok).toBe(true);
		expect(
			(await openNote(host, path)).note?.blocks.map((block) => block.id),
		).toEqual(["keep"]);
		expect(
			(await readPending(host, note.header.noteId)).some(
				(entry) => entry.blockId === "future" && entry.after === null,
			),
		).toBe(true);
	});
	it("saves Enter between two future-attr owners (the second moves to a new block)", async () => {
		const { host, path } = await withNote([futureBlock()]);
		const opened = await openNote(host, path);
		const doc = getSchema(createExtensions()).nodeFromJSON(opened.doc).toJSON();
		const [date, marked] = doc.content[0].content;
		doc.content = [
			{ ...doc.content[0], content: [date] },
			{
				...doc.content[0],
				attrs: { ...doc.content[0].attrs, id: "split" },
				content: [marked],
			},
		];
		const result = await saveDoc(host, opened, doc);
		if (!result.ok) throw new Error(result.message);
		const [first, second] = result.note.blocks.map(
			(block) => block.content as JSONContent[],
		);
		expect(first?.[0]?.attrs?.future).toEqual({ x: 1 });
		expect(second?.[0]?.marks?.[0]?.attrs?.future).toEqual([1, 2]);
	});

	it("saves a join of two blocks that both carry future attrs", async () => {
		const other = {
			...futureBlock(),
			id: "other",
			content: [
				{ type: "date", attrs: { date: "2026-12-01", future: "y" } },
			] as never,
		};
		const { host, path } = await withNote([futureBlock(), other]);
		const opened = await openNote(host, path);
		const doc = getSchema(createExtensions()).nodeFromJSON(opened.doc).toJSON();
		doc.content[0].content.push(...doc.content[1].content);
		doc.content.pop();
		const result = await saveDoc(host, opened, doc);
		if (!result.ok) throw new Error(result.message);
		const saved = result.note.blocks[0]?.content as JSONContent[];
		expect(saved.map((item) => item.attrs?.future)).toEqual([
			{ x: 1 },
			undefined,
			"y",
		]);
		expect(saved[1]?.marks?.[0]?.attrs?.future).toEqual([1, 2]);
	});

	it("refuses deleting one future-attr owner inside a surviving block", async () => {
		const { host, path, note } = await withNote([futureBlock()]);
		const before = await host.readText(path);
		const pendingBefore = await readPending(host, note.header.noteId);
		const opened = await openNote(host, path);
		const doc = getSchema(createExtensions()).nodeFromJSON(opened.doc).toJSON();
		doc.content[0].content.shift();
		const write = vi.spyOn(host, "writeTextAtomic");
		const result = await saveDoc(host, opened, doc);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.message).toBe(INLINE_SAVE_REFUSAL);
		expect(write).not.toHaveBeenCalled();
		expect(await host.readText(path)).toBe(before);
		expect(await readPending(host, note.header.noteId)).toEqual(pendingBefore);
	});

	it("round-trips unknown inline node and mark attrs while editing another block", async () => {
		const blocks: Note["blocks"] = [
			futureBlock(),
			{
				id: "edited",
				type: "paragraph",
				parent: null,
				content: text("before"),
			},
		];
		const { host, path, note } = await withNote(blocks);
		const originalLine = (await host.readText(path)).split("\n")[1];
		const pendingBefore = await readPending(host, note.header.noteId);
		const opened = await openNote(host, path);
		expect(opened.editable).toBe(true);
		const editorDoc = getSchema(createExtensions())
			.nodeFromJSON(opened.doc)
			.toJSON();
		editorDoc.content[1].content[0].text = "after";
		const result = await saveDoc(host, opened, editorDoc);
		expect(result.ok).toBe(true);
		expect((await host.readText(path)).split("\n")[1]).toBe(originalLine);
		expect(
			(await readPending(host, note.header.noteId))
				.slice(pendingBefore.length)
				.map((entry) => entry.blockId),
		).toEqual(["edited"]);
	});

	it("retains unknown attrs when their owning inline node and mark are edited", async () => {
		const { host, path } = await withNote([futureBlock()]);
		const opened = await openNote(host, path);
		const doc = getSchema(createExtensions()).nodeFromJSON(opened.doc).toJSON();
		doc.content[0].content[0].attrs.date = "2026-11-06";
		doc.content[0].content[1].text = "changed";
		const result = await saveDoc(host, opened, doc);
		if (!result.ok) throw new Error(result.message);
		const saved = result.note.blocks[0]?.content as JSONContent[];
		expect(saved[0]?.attrs?.future).toEqual({ x: 1 });
		expect(saved[1]?.marks?.[0]?.attrs?.future).toEqual([1, 2]);
	});

	it("refuses unsupported inline shapes before writing note or pending", async () => {
		const { host, path, note } = await withNote([
			{
				id: "p",
				type: "paragraph",
				parent: null,
				content: [
					{ type: "text", text: "x", attrs: { future: true } },
				] as never,
			},
			{ id: "q", type: "paragraph", parent: null, content: text("before") },
		]);
		const before = await host.readText(path);
		const pendingBefore = await readPending(host, note.header.noteId);
		const opened = await openNote(host, path);
		expect(opened.editable).toBe(true);
		const doc = getSchema(createExtensions()).nodeFromJSON(opened.doc).toJSON();
		doc.content[1].content[0].text = "after";
		const write = vi.spyOn(host, "writeTextAtomic");
		const result = await saveDoc(host, opened, doc);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.message).toBe(INLINE_SAVE_REFUSAL);
		expect(write).not.toHaveBeenCalled();
		expect(await host.readText(path)).toBe(before);
		expect(await readPending(host, note.header.noteId)).toEqual(pendingBefore);
	});

	it.each(["node", "mark"])(
		"refuses a save when the editor drops an unknown %s attribute",
		async (owner) => {
			const { host, path, note } = await withNote([futureBlock()]);
			const before = await host.readText(path);
			const pendingBefore = await readPending(host, note.header.noteId);
			const opened = await openNote(host, path);
			expect(opened.editable).toBe(true);
			const doc = getSchema(createExtensions())
				.nodeFromJSON(opened.doc)
				.toJSON();
			const attrs =
				owner === "node"
					? doc.content[0].content[0].attrs
					: doc.content[0].content[1].marks[0].attrs;
			delete attrs[INLINE_EXTRA_ATTR];
			const write = vi.spyOn(host, "writeTextAtomic");
			const result = await saveDoc(host, opened, doc);
			expect(result.ok).toBe(false);
			if (!result.ok) expect(result.message).toBe(INLINE_SAVE_REFUSAL);
			expect(write).not.toHaveBeenCalled();
			expect(await host.readText(path)).toBe(before);
			expect(await readPending(host, note.header.noteId)).toEqual(
				pendingBefore,
			);
		},
	);
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

describe("consent to edit a truncated note", () => {
	it("writes nothing until consent, then saves edits with complete blocks", async () => {
		const { host, path, note } = await withNote(BLOCKS);
		await host.writeTextAtomic(path, `${serializeNote(note)}{broken\n`);
		const write = vi.spyOn(host, "writeTextAtomic");
		const opened = await openNote(host, path);
		const draft = { title: "Sample", doc: opened.doc };
		expect(opened.editable).toBe(false);
		expect((await saveDraft(host, opened, draft)).ok).toBe(false);
		expect(write).not.toHaveBeenCalled();
		expect(allowEditing(lockedForReadOnlyVault(opened)).editable).toBe(false);
		const editable = allowEditing(opened);
		expect(editable.editable).toBe(true);
		const edited = structuredClone(draft.doc);
		edited.content?.push({
			type: "paragraph",
			attrs: { id: "added" },
			content: [{ type: "text", text: "Edited" }],
		});
		expect(
			(await saveDraft(host, editable, { ...draft, doc: edited })).ok,
		).toBe(true);
		// The note itself is written once; saving also records its pending change.
		expect(write.mock.calls.filter(([p]) => p === path)).toHaveLength(1);
		expect((await openNote(host, path)).note?.blocks).toEqual([
			...note.blocks,
			{
				id: "added",
				type: "paragraph",
				parent: null,
				content: [{ type: "text", text: "Edited" }],
			},
		]);
	});

	it("forgets consent when reopening without an edit", async () => {
		const { host, path, note } = await withNote(BLOCKS);
		await host.writeTextAtomic(path, `${serializeNote(note)}bad\n`);
		expect(allowEditing(await openNote(host, path)).editable).toBe(true);
		expect((await openNote(host, path)).editable).toBe(false);
	});

	it.each(["corrupt", "newer", "duplicate", "block ids", "unknown block"])(
		"never unlocks %s notes, even with skipped lines",
		async (kind) => {
			const { host, path, note } = await withNote(BLOCKS);
			if (kind === "newer") note.header.v = 2;
			if (kind === "duplicate")
				await host.writeTextAtomic("Copy.vnote", serializeNote(note));
			if (kind === "block ids")
				note.blocks.push(note.blocks[0] as Note["blocks"][number]);
			if (kind === "unknown block")
				note.blocks.push({ id: "future", type: "future", parent: null });
			await host.writeTextAtomic(
				path,
				kind === "corrupt" ? "bad\n" : `${serializeNote(note)}bad\n`,
			);
			const write = vi.spyOn(host, "writeTextAtomic");
			const opened = allowEditing(await openNote(host, path));
			expect(opened.editable).toBe(false);
			expect((await saveDoc(host, opened, opened.doc)).ok).toBe(false);
			expect(write).not.toHaveBeenCalled();
		},
	);
});
