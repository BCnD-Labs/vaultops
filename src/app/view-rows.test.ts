import { describe, expect, it } from "vitest";
import { createNote, loadNote, saveNote } from "../core/notes/repository";
import { MemoryHost } from "../host/memory-host";
import { loadVault, type NoteRow } from "./session";
import { createViewRows } from "./view-rows";

const note = (path: string, more: Partial<NoteRow> = {}): NoteRow => ({
	path,
	title: path,
	preview: "",
	readOnly: false,
	tags: [],
	fields: {},
	...more,
});

describe("view rows", () => {
	it("keeps rows and the snapshot when only text or preview change", () => {
		const store = createViewRows();
		let heard = 0;
		store.subscribe(() => heard++);
		store.sync([note("a"), note("b")]);
		const first = store.getSnapshot();
		store.sync([note("a", { text: "typing", preview: "typing" }), note("b")]);
		expect(store.getSnapshot()).toBe(first);
		expect(heard).toBe(1);
	});

	it("bumps only the changed row's version, and drops removed notes", () => {
		const store = createViewRows();
		const b = note("b");
		store.sync([note("a"), b]);
		const [a1, b1] = store.getSnapshot();
		const fields = { s: { name: "S", type: "select" as const, value: "Do" } };
		store.sync([note("a", { fields }), b]);
		const [a2, b2] = store.getSnapshot();
		expect(a2?.version).not.toBe(a1?.version);
		expect(a2?.fields).toEqual(fields);
		expect(b2).toBe(b1);
		store.sync([note("a", { fields }), b]);
		expect(store.getSnapshot()[0]).toBe(a2);
		store.sync([b]);
		expect(store.getSnapshot()).toEqual([b1]);
	});

	it("reads typed properties and the type from the vault scan", async () => {
		const host = new MemoryHost();
		await loadVault(host);
		const created = await createNote(host, "", "Dune");
		const { note } = await loadNote(host, created.path);
		if (!note) throw new Error("note not readable");
		const header = {
			...note.header,
			props: { Pages: { type: "number", value: 412 } },
			resource: { type: "book" },
		};
		await saveNote(host, created.path, { ...note, header });
		const row = (await loadVault(host)).notes.find(
			(n) => n.path === created.path,
		);
		expect(row?.fields).toEqual({
			pages: { name: "Pages", type: "number", value: 412 },
		});
		expect(row?.type).toBe("book");
	});
});
