import { describe, expect, it } from "vitest";
import {
	type Block,
	NOTE_FORMAT,
	NOTE_FORMAT_VERSION,
	type Note,
	parseNote,
	serializeNote,
} from "../note-format";
import {
	canvasConnectors,
	canvasNodes,
	connectorEnds,
	groupMembers,
	numberAttr,
} from "./canvas-ops";
import { CANVAS_TEMPLATES, LABEL_ROOM } from "./canvas-templates";

const counter = () => {
	let n = 0;
	return () => `id-${++n}`;
};

/** An item's box; labels size themselves, so they get the room the templates leave. */
const box = (block: Block) => ({
	x: numberAttr(block, "x", 0),
	y: numberAttr(block, "y", 0),
	w: numberAttr(block, "w", LABEL_ROOM.w),
	h: numberAttr(block, "h", LABEL_ROOM.h),
});
const overlap = (a: ReturnType<typeof box>, b: ReturnType<typeof box>) =>
	a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe("canvas templates", () => {
	it("offers mind map, flowchart, timeline and board", () => {
		expect(CANVAS_TEMPLATES.map((t) => t.id)).toEqual([
			"mind-map",
			"flowchart",
			"timeline",
			"board",
		]);
	});

	describe.each(CANVAS_TEMPLATES)("$name", (template) => {
		const blocks = template.build(counter());

		it("has unique ids, all from the injected function", () => {
			const ids = blocks.map((b) => b.id);
			expect(new Set(ids).size).toBe(ids.length);
			expect(ids.every((id) => /^id-\d+$/.test(id as string))).toBe(true);
		});

		it("connects only items that exist", () => {
			const nodes = new Set(canvasNodes(blocks).map((b) => b.id));
			for (const connector of canvasConnectors(blocks)) {
				const { from, to } = connectorEnds(connector);
				expect(nodes.has(from)).toBe(true);
				expect(nodes.has(to)).toBe(true);
			}
		});

		it("lists only existing items as frame members", () => {
			const ids = new Set(blocks.map((b) => b.id));
			for (const group of blocks.filter((b) => b.type === "group"))
				for (const member of groupMembers(group))
					expect(ids.has(member)).toBe(true);
		});

		it("keeps items from overlapping at their default sizes", () => {
			const inFrame = new Set(
				blocks.filter((b) => b.type === "group").flatMap(groupMembers),
			);
			const nodes = canvasNodes(blocks);
			const frames = nodes.filter((b) => b.type === "group");
			for (const member of nodes.filter((b) => inFrame.has(b.id as string))) {
				const frame = frames.find((f) =>
					groupMembers(f).includes(member.id as string),
				);
				const outer = box(frame as Block);
				const inner = box(member);
				expect(inner.x).toBeGreaterThanOrEqual(outer.x);
				expect(inner.y).toBeGreaterThanOrEqual(outer.y);
				expect(inner.x + inner.w).toBeLessThanOrEqual(outer.x + outer.w);
				expect(inner.y + inner.h).toBeLessThanOrEqual(outer.y + outer.h);
			}
			const loose = nodes.filter((b) => !inFrame.has(b.id as string));
			for (const [i, a] of loose.entries())
				for (const b of loose.slice(i + 1))
					expect(overlap(box(a), box(b)), `${a.id} and ${b.id}`).toBe(false);
		});

		it("saves and reads back with no problems", () => {
			const note: Note = {
				header: {
					format: NOTE_FORMAT,
					v: NOTE_FORMAT_VERSION,
					noteId: "template-test",
					title: template.name,
					kind: "canvas",
				},
				blocks,
			};
			const parsed = parseNote(serializeNote(note));
			expect(parsed.problems).toEqual([]);
			expect(parsed.skippedLines).toEqual([]);
			expect(parsed.note?.blocks).toEqual(blocks);
		});
	});

	it("builds the shapes each template promises", () => {
		const by = (id: string) =>
			CANVAS_TEMPLATES.find((t) => t.id === id)?.build(counter()) ?? [];
		const count = (blocks: Block[], type: string) =>
			blocks.filter((b) => b.type === type).length;
		const mind = by("mind-map");
		expect(count(mind, "sticky")).toBe(5);
		expect(canvasConnectors(mind)).toHaveLength(5);
		const flow = by("flowchart");
		expect(count(flow, "shape")).toBe(5);
		expect(count(flow, "label")).toBe(2);
		expect(canvasConnectors(flow)).toHaveLength(5);
		const line = by("timeline");
		expect(count(line, "sticky")).toBe(5);
		expect(count(line, "label")).toBe(5);
		const board = by("board");
		expect(count(board, "group")).toBe(3);
		expect(board.filter((b) => b.type === "group").map((g) => g.attrs)).toEqual(
			[
				expect.objectContaining({ title: "To do" }),
				expect.objectContaining({ title: "Doing" }),
				expect.objectContaining({ title: "Done" }),
			],
		);
	});
});
