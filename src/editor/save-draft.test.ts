import { describe, expect, it, vi } from "vitest";
import { createNote, loadNote } from "../core/notes/repository";
import { MemoryHost } from "../host/memory-host";
import { openNote } from "./note-io";
import { saveAsCopy, saveDraft } from "./save-draft";

const doc = (text: string) => ({
	type: "doc",
	content: [
		{
			type: "paragraph",
			attrs: { id: "p1" },
			content: [{ type: "text", text }],
		},
	],
});

async function setup() {
	const host = new MemoryHost();
	await host.chooseVault();
	const { path } = await createNote(host, "", "Untitled");
	return { host, opened: await openNote(host, path) };
}

describe("saveDraft", () => {
	it("saves the body and keeps the file name when the title is unchanged", async () => {
		const { host, opened } = await setup();
		const result = await saveDraft(host, opened, {
			doc: doc("hello"),
			title: "Untitled",
		});
		expect(result).toMatchObject({ ok: true, path: opened.path });
		const parsed = await loadNote(host, opened.path);
		expect(parsed.note?.blocks).toHaveLength(1);
	});

	it("saves body and title together, renames the file, keeps noteId", async () => {
		const { host, opened } = await setup();
		const noteId = opened.note?.header.noteId;
		const result = await saveDraft(host, opened, {
			doc: doc("hello"),
			title: "Groceries",
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.path).toBe("Groceries.vnote");
		expect(result.titleChanged).toBe(true);
		const parsed = await loadNote(host, result.path);
		expect(parsed.note?.header.title).toBe("Groceries");
		expect(parsed.note?.header.noteId).toBe(noteId);
		expect(parsed.note?.blocks).toHaveLength(1);
		expect(await host.kindOf("Untitled.vnote")).toBeNull();
	});

	it("refuses a read-only note without writing", async () => {
		const { host, opened } = await setup();
		const result = await saveDraft(
			host,
			{ ...opened, editable: false },
			{ doc: doc("x"), title: "New" },
		);
		expect(result.ok).toBe(false);
		expect(await host.kindOf("Untitled.vnote")).toBe("file");
	});

	it("keeps content and title saved when the rename cannot happen", async () => {
		const { host, opened } = await setup();
		host.move = async () => {
			throw new Error("busy");
		};
		const result = await saveDraft(host, opened, {
			doc: doc("kept"),
			title: "Renamed",
		});
		expect(result).toMatchObject({ ok: true, path: opened.path });
		if (result.ok) expect(result.notice).toContain("busy");
		const parsed = await loadNote(host, opened.path);
		expect(parsed.note?.header.title).toBe("Renamed");
		expect(parsed.note?.blocks).toHaveLength(1);
	});

	it("does not overwrite a file that changed on disk, and writes nothing", async () => {
		const { host, opened } = await setup();
		await host.writeTextAtomic(opened.path, "changed elsewhere");
		const write = vi.spyOn(host, "writeTextAtomic");
		const result = await saveDraft(host, opened, {
			doc: doc("mine"),
			title: "Untitled",
		});
		expect(result).toMatchObject({ ok: false, conflict: true });
		expect(write).not.toHaveBeenCalled();
		expect(await host.readText(opened.path)).toBe("changed elsewhere");
	});

	it("reads the file again on every save, so a repeat after a conflict is checked against the disk as it is now", async () => {
		const { host, opened } = await setup();
		const draft = { doc: doc("mine"), title: "Untitled" };
		await host.writeTextAtomic(opened.path, "first outside change");
		const read = vi.spyOn(host, "readText");
		const write = vi.spyOn(host, "writeTextAtomic");

		expect(await saveDraft(host, opened, draft)).toMatchObject({
			conflict: true,
		});
		await host.writeTextAtomic(opened.path, "second outside change");
		write.mockClear();
		expect(await saveDraft(host, opened, draft)).toMatchObject({
			conflict: true,
		});
		expect(read).toHaveBeenCalledTimes(2);
		expect(write).not.toHaveBeenCalled();
		expect(await host.readText(opened.path)).toBe("second outside change");
	});

	it("saves the same draft once the file is back to what the app last wrote", async () => {
		const { host, opened } = await setup();
		const draft = { doc: doc("mine"), title: "Untitled" };
		await host.writeTextAtomic(opened.path, "outside change");
		expect(await saveDraft(host, opened, draft)).toMatchObject({
			conflict: true,
		});
		await host.writeTextAtomic(opened.path, opened.baseText as string);
		const result = await saveDraft(host, opened, draft);
		expect(result.ok).toBe(true);
		const parsed = await loadNote(host, opened.path);
		expect(parsed.note?.blocks).toHaveLength(1);
	});

	it("reports a note moved or deleted outside the app as a conflict", async () => {
		const { host, opened } = await setup();
		await host.move(opened.path, "Elsewhere.vnote");
		const result = await saveDraft(host, opened, {
			doc: doc("mine"),
			title: "Untitled",
		});
		expect(result).toMatchObject({ ok: false, conflict: true });
		expect(await host.kindOf(opened.path)).toBeNull();
	});

	it("a save succeeds after the app's own previous save (no false conflict)", async () => {
		const { host, opened } = await setup();
		const first = await saveDraft(host, opened, {
			doc: doc("one"),
			title: "Untitled",
		});
		expect(first.ok).toBe(true);
		if (!first.ok) return;
		const next = {
			...opened,
			path: first.path,
			note: first.note,
			baseText: first.text,
		};
		const second = await saveDraft(host, next, {
			doc: doc("two"),
			title: "Renamed",
		});
		expect(second.ok).toBe(true);
		if (!second.ok) return;
		expect(await host.readText(second.path)).toBe(second.text);
	});

	it("saves my version as a separate copy with its own noteId and leaves the original", async () => {
		const { host, opened } = await setup();
		await host.writeTextAtomic(opened.path, "changed elsewhere");
		const result = await saveAsCopy(host, opened, {
			doc: doc("mine"),
			title: "Untitled",
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.path).toBe("Untitled (copy).vnote");
		const parsed = await loadNote(host, result.path);
		expect(parsed.note?.header.title).toBe("Untitled (copy)");
		expect(parsed.note?.header.noteId).not.toBe(opened.note?.header.noteId);
		expect(parsed.note?.blocks).toHaveLength(1);
		expect(await host.readText(opened.path)).toBe("changed elsewhere");
	});
});

describe("saveDraft with properties", () => {
	const props = {
		tags: { type: "list", value: ["idea"] },
		Due: { type: "date", value: "2026-11-05" },
		Status: { type: "select", value: "Open", options: ["Open"] },
	};

	it("saves the properties in the header and keeps noteId and body", async () => {
		const { host, opened } = await setup();
		const noteId = opened.note?.header.noteId;
		const result = await saveDraft(host, opened, {
			doc: doc("hello"),
			title: "Untitled",
			props,
		});
		expect(result.ok).toBe(true);
		const parsed = await loadNote(host, opened.path);
		expect(parsed.note?.header.props).toEqual(props);
		expect(parsed.note?.header.noteId).toBe(noteId);
		expect(parsed.note?.blocks).toHaveLength(1);
	});

	it("leaves the header's props alone when the draft has none", async () => {
		const { host, opened } = await setup();
		await saveDraft(host, opened, { doc: doc("a"), title: "Untitled", props });
		const reopened = await openNote(host, opened.path);
		await saveDraft(host, reopened, { doc: doc("b"), title: "Untitled" });
		const parsed = await loadNote(host, opened.path);
		expect(parsed.note?.header.props).toEqual(props);
	});

	it("keeps the tags when the title renames the file", async () => {
		const { host, opened } = await setup();
		const result = await saveDraft(host, opened, {
			doc: doc("a"),
			title: "Brand new title",
			props,
		});
		expect(result.ok && result.path).toBe("Brand new title.vnote");
		const parsed = await loadNote(host, "Brand new title.vnote");
		expect(parsed.note?.header.props).toEqual(props);
	});

	it("removing the last property leaves no props in the file", async () => {
		const { host, opened } = await setup();
		await saveDraft(host, opened, { doc: doc("a"), title: "Untitled", props });
		const reopened = await openNote(host, opened.path);
		await saveDraft(host, reopened, {
			doc: doc("a"),
			title: "Untitled",
			props: {},
		});
		const parsed = await loadNote(host, opened.path);
		expect("props" in (parsed.note?.header ?? {})).toBe(false);
	});

	it("a copy carries the properties and gets a new noteId", async () => {
		const { host, opened } = await setup();
		const copy = await saveAsCopy(host, opened, {
			doc: doc("a"),
			title: "Untitled",
			props,
		});
		if (!copy.ok) throw new Error(copy.message);
		const parsed = await loadNote(host, copy.path);
		expect(parsed.note?.header.props).toEqual(props);
		expect(parsed.note?.header.noteId).not.toBe(opened.note?.header.noteId);
	});
});
