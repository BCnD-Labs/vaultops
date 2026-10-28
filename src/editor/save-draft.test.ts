import { describe, expect, it } from "vitest";
import { createNote, loadNote } from "../core/notes/repository";
import { MemoryHost } from "../host/memory-host";
import { openNote } from "./note-io";
import { saveDraft } from "./save-draft";

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
});
