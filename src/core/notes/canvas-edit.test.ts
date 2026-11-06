import { expect, it } from "vitest";
import { MemoryHost } from "../../host/memory-host";
import { type Block, parseNote, serializeNote } from "../note-format";
import { restoreCanvasText, saveCanvasEdit } from "./canvas-edit";

const sticky = (id: string, x: number): Block => ({
	id,
	type: "sticky",
	parent: null,
	attrs: { x, y: 0, w: 100, h: 50 },
});

async function canvas(host: MemoryHost) {
	const text = serializeNote({
		header: { format: "vaultops-note", v: 1, noteId: "c", kind: "canvas" },
		blocks: [sticky("a", 0), sticky("b", 0)],
	} as never);
	await host.writeTextAtomic("c.vo", text);
	return text;
}
const moveTo = (id: string, x: number) => (blocks: Block[]) =>
	blocks.map((block) =>
		block.id === id
			? { ...block, attrs: { ...(block.attrs as object), x } }
			: block,
	);

it("two edits from the same base: one is saved, the other refused, none lost silently", async () => {
	const host = new MemoryHost();
	const text = await canvas(host);
	const results = await Promise.allSettled([
		saveCanvasEdit(host, "c.vo", text, moveTo("a", 1)),
		saveCanvasEdit(host, "c.vo", text, moveTo("b", 2)),
	]);
	expect(results.map((r) => r.status)).toEqual(["fulfilled", "rejected"]);
	const blocks = parseNote(await host.readText("c.vo")).note?.blocks ?? [];
	expect(blocks.map((b) => (b.attrs as { x: number }).x)).toEqual([1, 0]);
});

it("edits chained on each other's results all land", async () => {
	const host = new MemoryHost();
	const text = await canvas(host);
	const first = saveCanvasEdit(host, "c.vo", text, moveTo("a", 1));
	const second = first.then((saved) =>
		saveCanvasEdit(host, "c.vo", saved, moveTo("b", 2)),
	);
	await second;
	const blocks = parseNote(await host.readText("c.vo")).note?.blocks ?? [];
	expect(blocks.map((b) => (b.attrs as { x: number }).x)).toEqual([1, 2]);
});

it("a restore and an edit from the same screen text do not both win", async () => {
	const host = new MemoryHost();
	const text = await canvas(host);
	const older = serializeNote({
		header: { format: "vaultops-note", v: 1, noteId: "c", kind: "canvas" },
		blocks: [sticky("a", 9), sticky("b", 9)],
	} as never);
	const results = await Promise.allSettled([
		restoreCanvasText(host, "c.vo", text, older),
		saveCanvasEdit(host, "c.vo", text, moveTo("a", 1)),
	]);
	expect(results.map((r) => r.status)).toEqual(["fulfilled", "rejected"]);
	expect(await host.readText("c.vo")).toBe(older);
});
