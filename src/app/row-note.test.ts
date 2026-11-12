import type { JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { loadNote } from "../core/notes/repository";
import { noteTitleFor } from "../core/notes/row-notes";
import { HostError } from "../host/host";
import { MemoryHost } from "../host/memory-host";
import { readOnlyHost } from "../host/read-only-host";
import { createRowNote, rowPageBlocks } from "./row-note";

const para = (id: string, text: string): JSONContent => ({
	type: "paragraph",
	attrs: { id },
	content: [{ type: "text", text }],
});
const quote = (id: string, ...inner: JSONContent[]): JSONContent => ({
	type: "blockquote",
	attrs: { id },
	content: inner,
});

describe("a row page as a note", () => {
	it("gives every block a new id and keeps who sits inside whom", () => {
		const blocks = rowPageBlocks([
			para("a", "one"),
			quote("q", para("b", "two")),
		]);
		expect(blocks.map((b) => [b.type, b.parent === null])).toEqual([
			["paragraph", true],
			["blockquote", true],
			["paragraph", false],
		]);
		const ids = blocks.map((b) => b.id);
		expect(new Set(ids).size).toBe(3);
		expect(ids).not.toContain("a");
		expect(ids).not.toContain("b");
		expect(ids).not.toContain("q");
		expect(blocks[2]?.parent).toBe(blocks[1]?.id);
	});

	it("makes the note beside the database's note, with the row's name and page", async () => {
		const host = new MemoryHost();
		await host.makeFolder("Books");
		const made = await createRowNote(host, "Books", "Dune", [
			para("a", "Spice"),
		]);
		if (!made.ok) throw new Error(made.message);
		expect(await host.kindOf("Books/Dune.vnote")).toBe("file");
		const parsed = await loadNote(host, "Books/Dune.vnote");
		expect(parsed.note?.header.noteId).toBe(made.target);
		expect(parsed.note?.header.title).toBe("Dune");
		expect(parsed.note?.blocks).toHaveLength(1);
		expect(JSON.stringify(parsed.note?.blocks)).toContain("Spice");
	});

	it("makes an ordinary empty note when the row has no page", async () => {
		const host = new MemoryHost();
		const made = await createRowNote(host, "", "Untitled", []);
		if (!made.ok) throw new Error(made.message);
		const parsed = await loadNote(host, "Untitled.vnote");
		expect(parsed.note?.blocks.map((b) => b.type)).toEqual(["paragraph"]);
	});

	it("does not pick a name already taken", async () => {
		const host = new MemoryHost();
		const first = await createRowNote(host, "", "Dune", []);
		const second = await createRowNote(host, "", "Dune", []);
		expect(first.ok && second.ok).toBe(true);
		expect(first.ok && second.ok && first.target !== second.target).toBe(true);
		expect(await host.kindOf("Dune 2.vnote")).toBe("file");
	});

	it("reports why and writes nothing when the note can't be saved", async () => {
		const memory = new MemoryHost();
		const made = await createRowNote(readOnlyHost(memory), "", "Dune", [
			para("a", "Spice"),
		]);
		expect(made.ok).toBe(false);
		if (!made.ok) expect(made.message).toMatch(/not made/i);
		expect(await memory.list("")).toEqual([]);
	});

	it("reports a failing disk without throwing", async () => {
		const host = new MemoryHost();
		host.writeTextAtomic = async () => {
			throw new HostError("io", "disk full");
		};
		const made = await createRowNote(host, "", "Dune", []);
		expect(made).toEqual({
			ok: false,
			message: "The note was not made: disk full",
		});
	});
});

describe("the note's name for a row", () => {
	it("trims it, and calls a blank name Untitled", () => {
		expect(noteTitleFor("  Dune  ")).toBe("Dune");
		expect(noteTitleFor("")).toBe("Untitled");
		expect(noteTitleFor("   ")).toBe("Untitled");
	});
});
