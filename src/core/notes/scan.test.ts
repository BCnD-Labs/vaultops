import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { HostError } from "../../host/host";
import { MemoryHost } from "../../host/memory-host";
import {
	type Block,
	type JsonValue,
	NOTE_FORMAT,
	NOTE_FORMAT_VERSION,
	parseNote,
	serializeNote,
} from "../note-format";
import { previewOf, scanVault, searchTextOf } from "./scan";

function text(id: string, version = NOTE_FORMAT_VERSION): string {
	return serializeNote({
		header: { format: NOTE_FORMAT, v: version, noteId: id },
		blocks: [{ id: "block-1", type: "paragraph", parent: null }],
	});
}

describe("scanVault", () => {
	it("reports canvas kind and warns when a block exists in two documents", async () => {
		const host = new MemoryHost();
		await host.writeTextAtomic("note.vnote", text("note"));
		await host.writeTextAtomic(
			"canvas.vnote",
			text("canvas").replace(
				'"noteId":"canvas"',
				'"noteId":"canvas","kind":"canvas"',
			),
		);
		const { notes, report } = await scanVault(host);
		expect(notes.map((note) => [note.path, note.kind])).toEqual([
			["canvas.vnote", "canvas"],
			["note.vnote", "note"],
		]);
		expect(report.map((entry) => entry.duplicateBlockOf)).toEqual([
			["note.vnote"],
			["canvas.vnote"],
		]);
		expect(
			report.every((entry) =>
				entry.reason.includes("block exists in two places"),
			),
		).toBe(true);
	});
	it("reports every health group and preserves every file exactly", async () => {
		const host = new MemoryHost();
		const files = {
			"good.vnote": text("good"),
			"corrupt.vnote": "not a note\n",
			"truncated.vnote": `${text("truncated")}{{\n`,
			"newer.vnote": text("newer", NOTE_FORMAT_VERSION + 1),
			"other.txt": "leave me alone\r\n",
		};
		for (const [path, contents] of Object.entries(files)) {
			await host.writeTextAtomic(path, contents);
		}
		const write = vi.spyOn(host, "writeTextAtomic");
		const move = vi.spyOn(host, "move");
		const mkdir = vi.spyOn(host, "makeFolder");
		const { notes, report } = await scanVault(host);
		expect(report.map(({ path, group }) => [path, group])).toEqual([
			["corrupt.vnote", "corrupt"],
			["good.vnote", "good"],
			["newer.vnote", "newer-format"],
			["truncated.vnote", "truncated"],
		]);
		expect(notes.map(({ path, readOnly }) => [path, readOnly])).toEqual([
			["good.vnote", false],
			["newer.vnote", true],
			["truncated.vnote", true],
		]);
		expect(
			notes.find(({ path }) => path === "truncated.vnote")?.note.blocks,
		).toEqual([{ id: "block-1", type: "paragraph", parent: null }]);
		expect(report.every((entry) => entry.reason.length > 0)).toBe(true);
		expect(report.find((e) => e.group === "truncated")?.reason).toBe(
			"Some lines could not be read, so only the complete blocks are shown. Nothing is changed unless you choose to edit it. A block exists in two places.",
		);
		for (const [path, contents] of Object.entries(files)) {
			expect(await host.readText(path)).toBe(contents);
		}
		expect(notes.every((note) => note.preview === "")).toBe(true);
		expect(write).not.toHaveBeenCalled();
		expect(move).not.toHaveBeenCalled();
		expect(mkdir).not.toHaveBeenCalled();
	});

	it("keeps all copies readable and reports every other path for duplicate IDs", async () => {
		const host = new MemoryHost();
		const paths = ["a.vnote", "b.vnote", "c.vnote"];
		for (const path of paths) await host.writeTextAtomic(path, text("same"));
		const { notes, report } = await scanVault(host);
		expect(notes).toHaveLength(3);
		for (const path of paths) {
			expect(notes.find((note) => note.path === path)).toMatchObject({
				note: { header: { noteId: "same" } },
				readOnly: true,
			});
			expect(report.find((entry) => entry.path === path)).toMatchObject({
				group: "good",
				duplicateOf: paths.filter((other) => other !== path),
			});
			expect(await host.readText(path)).toBe(text("same"));
		}
	});

	it("finds nested notes and never enters or reads the reserved root folder", async () => {
		const host = new MemoryHost();
		await host.makeFolder("notes/deep.vnote");
		await host.makeFolder(".VaultOps/history");
		await host.writeTextAtomic("notes/deep.vnote/found.vnote", text("nested"));
		await host.writeTextAtomic(".VaultOps/hidden.vnote", text("hidden"));
		await host.writeTextAtomic(
			".VaultOps/history/hidden.vnote",
			text("hidden"),
		);
		const list = vi.spyOn(host, "list");
		const read = vi.spyOn(host, "readText");
		const result = await scanVault(host);
		expect(result.notes.map((note) => note.path)).toEqual([
			"notes/deep.vnote/found.vnote",
		]);
		expect(read.mock.calls).toEqual([["notes/deep.vnote/found.vnote"]]);
		expect(list.mock.calls.some(([path]) => path.startsWith(".VaultOps"))).toBe(
			false,
		);
	});

	it("reports unreadable files and continues to other notes", async () => {
		const host = new MemoryHost();
		await host.writeTextAtomic("a.vnote", text("unreadable"));
		await host.writeTextAtomic("b.vnote", text("readable"));
		vi.spyOn(host, "readText").mockRejectedValueOnce(
			new HostError("io", "read failed"),
		);
		const result = await scanVault(host);
		expect(result.report[0]).toMatchObject({
			path: "a.vnote",
			group: "corrupt",
			reason: "The file could not be read.",
		});
		expect(result.notes.map((note) => note.path)).toEqual(["b.vnote"]);
	});

	it("keeps blocks with ID problems readable but never calls them good", async () => {
		const host = new MemoryHost();
		await host.writeTextAtomic(
			"bad-ids.vnote",
			text("id").replace('"id":"block-1",', ""),
		);
		const result = await scanVault(host);
		expect(result.report[0]?.group).toBe("corrupt");
		expect(result.notes[0]).toMatchObject({ readOnly: true });
		expect(result.notes[0]?.note.blocks).toHaveLength(1);
	});

	it("gives newer format priority over skipped lines and still finds duplicates", async () => {
		const host = new MemoryHost();
		await host.writeTextAtomic("a.vnote", `${text("same", 99)}{\n`);
		await host.writeTextAtomic("b.vnote", text("same"));
		const result = await scanVault(host);
		expect(result.report[0]).toMatchObject({
			group: "newer-format",
			duplicateOf: ["b.vnote"],
		});
		expect(result.report[1]?.duplicateOf).toEqual(["a.vnote"]);
		expect(result.notes[0]?.note.blocks).toHaveLength(1);
	});

	it("returns empty results for an empty vault and propagates folder failures", async () => {
		const host = new MemoryHost();
		expect(await scanVault(host)).toEqual({
			notes: [],
			report: [],
			folders: [],
		});
		const error = new HostError("io", "cannot list folder");
		vi.spyOn(host, "list").mockRejectedValue(error);
		await expect(scanVault(host)).rejects.toBe(error);
	});

	it("lists every folder, empty ones included, but never .vaultops", async () => {
		const host = new MemoryHost();
		await host.makeFolder("a/b");
		await host.makeFolder("empty");
		await host.makeFolder(".vaultops/trash/x");
		await host.makeFolder(".VaultOps2");
		const { folders } = await scanVault(host);
		expect([...folders].sort()).toEqual([".VaultOps2", "a", "a/b", "empty"]);
	});
});

it("extracts bounded plain previews from headings, lists and tasks", () => {
	const body = (
		type: string,
		text: string,
		parent: string | null = null,
	): Block => ({
		type,
		parent,
		content: [{ type: "text", text }],
	});
	expect(
		previewOf([
			body("heading", " Heading\n"),
			{ type: "bulletList", parent: null },
			{ id: "i", type: "listItem", parent: null },
			body("paragraph", "List\titem", "i"),
			{ id: "t", type: "taskItem", parent: null, attrs: { checked: true } },
			body("paragraph", "Task text ", "t"),
		]),
	).toBe("Heading List item Task text");
	expect(previewOf([])).toBe("");
	expect(previewOf([body("paragraph", "x".repeat(300))])).toBe("x".repeat(160));
	expect(
		previewOf([
			{
				type: "paragraph",
				parent: null,
				content: [
					{ type: "text", text: "bold", marks: [{ type: "bold" }] },
					{ type: "hardBreak" },
					{ type: "text", text: "text" },
				],
			},
		]),
	).toBe("bold text");
});

// Keep the old extraction as a reference while replacing its recursive form.
function previousPlainText(blocks: Block[]): string {
	function text(value: JsonValue | undefined): string {
		if (Array.isArray(value)) return value.map(text).join("");
		if (!value || typeof value !== "object") return "";
		if (value.type === "hardBreak") return " ";
		if (
			value.type === "date" &&
			value.attrs &&
			typeof value.attrs === "object" &&
			!Array.isArray(value.attrs) &&
			typeof value.attrs.date === "string"
		)
			return value.attrs.date;
		if (
			value.type === "noteLink" &&
			value.attrs &&
			typeof value.attrs === "object" &&
			!Array.isArray(value.attrs) &&
			typeof value.attrs.label === "string"
		)
			return value.attrs.label;
		if (value.type === "text" && typeof value.text === "string")
			return value.text;
		return text(value.content);
	}
	return blocks
		.map((block) =>
			block.type === "mathBlock" &&
			block.attrs &&
			typeof block.attrs === "object" &&
			!Array.isArray(block.attrs) &&
			typeof block.attrs.latex === "string"
				? block.attrs.latex
				: block.type === "mathBlock"
					? ""
					: text(block.content),
		)
		.join(" ")
		.replace(/\s+/g, " ")
		.trim();
}

it("matches prior extraction on real note fixtures and whitespace edges", () => {
	for (const name of [
		"inline-and-code.vnote",
		"math-block.vnote",
		"toggle.vnote",
		"table.vnote",
		"code-block-display.vnote",
		"note-links.vnote",
		"database-row-note.vnote",
		"columns.vnote",
	]) {
		const file = new URL(`../../../test-fixtures/${name}`, import.meta.url);
		const parsed = parseNote(readFileSync(file, "utf8"));
		if (!parsed.note) throw new Error(`Fixture did not parse: ${name}`);
		const old = previousPlainText(parsed.note.blocks);
		expect(previewOf(parsed.note.blocks), name).toBe(old.slice(0, 160));
		expect(searchTextOf(parsed.note.blocks), name).toBe(old.slice(0, 20000));
	}
	const whitespaceCases: Block[][] = [
		[
			{
				type: "paragraph",
				parent: null,
				content: [{ type: "text", text: "\t\n\u00a0word \u2003 end\uFEFF " }],
			},
		],
		[
			{
				type: "paragraph",
				parent: null,
				content: [
					{ type: "hardBreak" },
					{ type: "text", text: "x" },
					{ type: "hardBreak" },
				],
			},
		],
		[
			{ type: "paragraph", parent: null, content: [] },
			{
				type: "paragraph",
				parent: null,
				content: [{ type: "text", text: " a " }],
			},
		],
		[
			{ type: "mathBlock", parent: null, attrs: { latex: " x\n y " } },
			{
				type: "paragraph",
				parent: null,
				content: [{ type: "text", text: "z" }],
			},
		],
		[
			{
				type: "paragraph",
				parent: null,
				content: [{ type: "text", text: `${"a".repeat(159)} \n b` }],
			},
		],
	];
	for (const blocks of whitespaceCases) {
		const old = previousPlainText(blocks);
		expect(previewOf(blocks)).toBe(old.slice(0, 160));
		expect(searchTextOf(blocks)).toBe(old.slice(0, 20000));
	}
});

it("extracts deeply nested text without recursive stack overflow", () => {
	let content: JsonValue = [
		{ type: "date", attrs: { date: "2030-01-02" } },
		{ type: "hardBreak" },
		{ type: "text", text: "deep" },
		{ type: "noteLink", attrs: { label: "note" } },
	];
	for (let i = 0; i < 10_000; i++) content = [content];
	const blocks: Block[] = [{ type: "paragraph", parent: null, content }];
	expect(previewOf(blocks)).toBe("2030-01-02 deepnote");
	expect(searchTextOf(blocks)).toBe("2030-01-02 deepnote");
});

it("applies output caps after whitespace normalization", () => {
	const blocks: Block[] = [
		{
			type: "paragraph",
			parent: null,
			content: [
				{ type: "text", text: `${"x".repeat(19_999)} \n y${"z".repeat(1000)}` },
			],
		},
	];
	const old = previousPlainText(blocks);
	expect(previewOf(blocks)).toBe(old.slice(0, 160));
	expect(searchTextOf(blocks)).toBe(old.slice(0, 20_000));
});
