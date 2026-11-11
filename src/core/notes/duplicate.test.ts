import { describe, expect, it } from "vitest";
import { MemoryHost } from "../../host/memory-host";
import { openVault } from "../vault/vault";
import { duplicateNote } from "./duplicate";
import { createCanvas, createNote, loadNote } from "./repository";

async function vault() {
	const host = new MemoryHost();
	await openVault(host);
	await host.makeFolder("Class");
	return host;
}

describe("duplicateNote", () => {
	it("copies a note beside it with a new noteId and the same blocks", async () => {
		const host = await vault();
		const made = await createNote(host, "Class", "Lecture");
		const before = await host.readText(made.path);
		const copy = await duplicateNote(host, made.path);
		expect(copy).toEqual({ path: "Class/Lecture (copy).vnote" });
		const note = (await loadNote(host, "Class/Lecture (copy).vnote")).note;
		expect(note?.header.title).toBe("Lecture (copy)");
		expect(note?.header.noteId).not.toBe(made.note.header.noteId);
		expect(note?.blocks).toEqual(made.note.blocks);
		expect(await host.readText(made.path)).toBe(before);
	});

	it("never overwrites: a second copy takes the next free name", async () => {
		const host = await vault();
		const made = await createNote(host, "", "Plan");
		await duplicateNote(host, made.path);
		const again = await duplicateNote(host, made.path);
		expect(again.path).toBe("Plan (copy) 2.vnote");
		const first = (await loadNote(host, "Plan (copy).vnote")).note;
		const second = (await loadNote(host, "Plan (copy) 2.vnote")).note;
		expect(first?.header.noteId).not.toBe(second?.header.noteId);
	});

	it("keeps a canvas a canvas", async () => {
		const host = await vault();
		const made = await createCanvas(host, "", "Board");
		const copy = await duplicateNote(host, made.path);
		const note = (await loadNote(host, copy.path ?? "")).note;
		expect(note?.header.kind).toBe("canvas");
	});

	it("refuses a read-only or damaged note and writes nothing", async () => {
		const host = await vault();
		const made = await createNote(host, "", "Locked");
		const readOnly = await duplicateNote(host, made.path, { readOnly: true });
		expect(readOnly.path).toBeUndefined();
		expect(readOnly.notice).toMatch(/read-only/);
		await host.writeTextAtomic("Broken.vnote", "not a note");
		const broken = await duplicateNote(host, "Broken.vnote");
		expect(broken.path).toBeUndefined();
		expect(broken.notice).toMatch(/could not be read/);
		const names = (await host.list("")).map((e) => e.name);
		expect(names.filter((n) => n.includes("(copy)"))).toEqual([]);
	});
});
