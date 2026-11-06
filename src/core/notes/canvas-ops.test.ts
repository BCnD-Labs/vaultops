import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import { MemoryHost } from "../../host/memory-host";
import {
	type Block,
	type Note,
	parseNote,
	serializeNote,
} from "../note-format";
import { extractBlock, insertBlock } from "./block-move";
import { saveCanvasEdit } from "./canvas-edit";
import {
	addConnector,
	addRoot,
	canvasConnectors,
	canvasNodes,
	createGroup,
	deleteRoots,
	groupMembers,
	groupOf,
	patchAttrs,
	setText,
	textOf,
} from "./canvas-ops";
import { moveBlock } from "./move-block";

const card = (id: string, x = 0, y = 0): Block => ({
	id,
	type: "paragraph",
	parent: null,
	attrs: { x, y },
	content: [{ text: id, type: "text" }],
});
const canvasNote = (blocks: Block[]): Note => ({
	header: { format: "vaultops-note", v: 1, noteId: "board", kind: "canvas" },
	blocks,
});

it("keeps connectors out of the nodes and lists them separately", () => {
	const blocks = addConnector([card("a"), card("b")], "a", "b", "c1");
	expect(canvasNodes(blocks).map((b) => b.id)).toEqual(["a", "b"]);
	expect(canvasConnectors(blocks).map((b) => b.id)).toEqual(["c1"]);
});

it("refuses a connector to itself, to a missing item, or a repeat", () => {
	const blocks = [card("a"), card("b")];
	expect(() => addConnector(blocks, "a", "a")).toThrow("two different");
	expect(() => addConnector(blocks, "a", "zzz")).toThrow("on the canvas");
	const linked = addConnector(blocks, "a", "b");
	expect(() => addConnector(linked, "a", "b")).toThrow("already connected");
});

it("deleting a card also removes its children and the connectors that touch it", () => {
	const blocks: Block[] = [
		card("a"),
		{ id: "a-child", type: "paragraph", parent: "a" },
		card("b"),
		card("c"),
		...addConnector([card("a"), card("b")], "a", "b", "ab").slice(2),
		{
			id: "bc",
			type: "connector",
			parent: null,
			attrs: { from: "b", to: "c" },
		},
	];
	const result = deleteRoots(blocks, ["a"]);
	expect(result.blocks.map((b) => b.id)).toEqual(["b", "c", "bc"]);
	expect(result.connectorsRemoved).toBe(1);
});

it("deleting a group removes only the group, not its members", () => {
	const grouped = createGroup(
		[card("a"), card("b"), card("c")],
		["a", "b"],
		{ x: 0, y: 0, w: 100, h: 50 },
		"g",
	);
	expect(groupMembers(grouped.find((b) => b.id === "g") as Block)).toEqual([
		"a",
		"b",
	]);
	const after = deleteRoots(grouped, ["g"]);
	expect(after.blocks.map((b) => b.id)).toEqual(["a", "b", "c"]);
});

it("deleting a member takes its id out of the group's list", () => {
	const grouped = createGroup(
		[card("a"), card("b"), card("c")],
		["a", "b", "c"],
		{ x: 0, y: 0, w: 100, h: 50 },
		"g",
	);
	const after = deleteRoots(grouped, ["b"]).blocks;
	expect(groupMembers(after.find((b) => b.id === "g") as Block)).toEqual([
		"a",
		"c",
	]);
});

it("a block is in one group at a time, and groups need two members", () => {
	const frame = { x: 0, y: 0, w: 10, h: 10 };
	const first = createGroup(
		[card("a"), card("b"), card("c")],
		["a", "b"],
		frame,
		"g1",
	);
	const second = createGroup(first, ["b", "c"], frame, "g2");
	expect(groupOf(second, "b")?.id).toBe("g2");
	expect(groupMembers(second.find((b) => b.id === "g1") as Block)).toEqual([
		"a",
	]);
	expect(() => createGroup(second, ["a"], frame)).toThrow("at least two");
	expect(() => createGroup(second, ["a", "g2"], frame)).toThrow("at least two");
});

it("sets and clears attributes and text without touching other fields", () => {
	let blocks = patchAttrs([card("a", 1, 2)], "a", { w: 200, x: undefined });
	expect(blocks[0]?.attrs).toEqual({ w: 200, y: 2 });
	blocks = setText(blocks, "a", "Hello");
	expect(textOf(blocks[0] as Block)).toBe("Hello");
	blocks = setText(blocks, "a", "");
	expect(blocks[0]?.content).toBeUndefined();
	expect(() => patchAttrs(blocks, "nope", { w: 1 })).toThrow("no longer");
	expect(() => addRoot(blocks, card("a"))).toThrow("already has");
});

it("never moves a canvas-only block into a note, and says so", () => {
	const board = canvasNote([
		card("a"),
		{ id: "s", type: "shape", parent: null, attrs: { x: 1, y: 1 } },
		{ id: "g", type: "group", parent: null, attrs: { members: ["a"] } },
	]);
	expect(() => extractBlock(board, "s")).toThrow("stay on the canvas");
	expect(() => extractBlock(board, "g")).toThrow("stay on the canvas");
	const note: Note = {
		header: { format: "vaultops-note", v: 1, noteId: "n" },
		blocks: [],
	};
	expect(() =>
		insertBlock(note, [{ id: "s2", type: "sticky", parent: null }], null),
	).toThrow("stay on the canvas");
});

it("moving a card to a note removes its connectors and its place in a group", () => {
	const board = canvasNote(
		createGroup(
			addConnector([card("a"), card("b")], "a", "b", "ab"),
			["a", "b"],
			{ x: 0, y: 0, w: 10, h: 10 },
			"g",
		),
	);
	const result = extractBlock(board, "a");
	expect(result.doc.blocks.map((b) => b.id)).toEqual(["b", "g"]);
	expect(groupMembers(result.doc.blocks[1] as Block)).toEqual(["b"]);
});

it("refuses to write a canvas-only block to a note file, nothing is moved", async () => {
	const host = new MemoryHost();
	await host.writeTextAtomic(
		"Board.vnote",
		serializeNote(
			canvasNote([
				{ id: "s", type: "shape", parent: null, attrs: { x: 0, y: 0 } },
			]),
		),
	);
	await host.writeTextAtomic(
		"Note.vnote",
		serializeNote({
			header: { format: "vaultops-note", v: 1, noteId: "n" },
			blocks: [],
		}),
	);
	const write = vi.spyOn(host, "writeTextAtomic");
	await expect(
		moveBlock(host, "Board.vnote", "Note.vnote", "s", { after: null }),
	).rejects.toThrow("stay on the canvas");
	expect(write).not.toHaveBeenCalled();
});

it("saves an edit only if the file is unchanged and the result passes the check", async () => {
	const host = new MemoryHost();
	const text = serializeNote(canvasNote([card("a")]));
	await host.writeTextAtomic("Board.vnote", text);
	const saved = await saveCanvasEdit(host, "Board.vnote", text, (blocks) =>
		patchAttrs(blocks, "a", { w: 5 }),
	);
	expect(parseNote(saved).note?.blocks[0]?.attrs).toEqual({ w: 5, x: 0, y: 0 });
	// The file moved on: a second edit based on the old text is refused.
	await expect(
		saveCanvasEdit(host, "Board.vnote", text, (blocks) => blocks),
	).rejects.toThrow("changed on disk");
	await expect(
		saveCanvasEdit(host, "Board.vnote", saved, () => [
			{ type: "paragraph", parent: null },
		]),
	).rejects.toThrow("save check");
});

it("reads the canvas-blocks fixture and saves it back byte for byte", () => {
	const text = readFileSync(
		new URL("../../../test-fixtures/canvas-blocks.vnote", import.meta.url),
		"utf8",
	);
	const parsed = parseNote(text);
	expect(parsed.problems).toEqual([]);
	if (!parsed.note) throw new Error("fixture did not parse");
	expect(canvasNodes(parsed.note.blocks).map((b) => b.type)).toEqual([
		"paragraph",
		"sticky",
		"shape",
		"label",
		"group",
	]);
	expect(canvasConnectors(parsed.note.blocks)).toHaveLength(2);
	expect(serializeNote(parsed.note)).toBe(text);
});
