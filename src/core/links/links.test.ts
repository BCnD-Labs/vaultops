import { describe, expect, it } from "vitest";
import { MemoryHost } from "../../host/memory-host";
import { type Block, NOTE_FORMAT, serializeNote } from "../note-format";
import { previewOf } from "../notes/scan";
import {
	backlinks,
	LINK_NODE,
	type LinkTarget,
	linksIn,
	searchTargets,
} from "./links";

const link = (kind: string, target: string, label = "X") => ({
	type: LINK_NODE,
	attrs: { kind, target, label },
});

function note(
	id: string,
	title: string,
	content: Block["content"] | undefined,
	extra: Record<string, string> = {},
) {
	return serializeNote({
		header: { format: NOTE_FORMAT, v: 1, noteId: id, title, ...extra },
		blocks: [{ id: `${id}-b`, type: "paragraph", parent: null, content }],
	});
}

describe("linksIn", () => {
	it("finds links in reading order, nested or not", () => {
		const blocks: Block[] = [
			{
				id: "a",
				type: "paragraph",
				parent: null,
				content: [
					{ type: "text", text: "see " },
					link("note", "n1", "One"),
					link("resource", "r1", "Sam"),
				],
			},
			{
				id: "b",
				type: "paragraph",
				parent: null,
				content: [{ type: "text", text: "no links" }],
			},
		];
		expect(linksIn(blocks)).toEqual([
			{ kind: "note", target: "n1", label: "One" },
			{ kind: "resource", target: "r1", label: "Sam" },
		]);
	});

	it("skips links with an unknown kind or no target", () => {
		const blocks: Block[] = [
			{
				id: "a",
				type: "paragraph",
				parent: null,
				content: [link("folder", "x"), link("note", "")],
			},
		];
		expect(linksIn(blocks)).toEqual([]);
	});
});

describe("searchTargets", () => {
	const targets: LinkTarget[] = [
		{ kind: "resource", target: "r1", label: "Sam Rivera" },
		{ kind: "note", target: "n1", label: "Meeting with Sam" },
		{ kind: "note", target: "n2", label: "Sam's trip" },
		{ kind: "canvas", target: "c1", label: "Samples map" },
		{ kind: "note", target: "n3", label: "Groceries" },
	];

	it("groups notes, canvases then resources and puts prefix matches first", () => {
		expect(searchTargets(targets, "sam").map((t) => t.target)).toEqual([
			"n2",
			"n1",
			"c1",
			"r1",
		]);
	});

	it("lists everything with an empty query, grouped", () => {
		expect(searchTargets(targets, "").map((t) => t.kind)).toEqual([
			"note",
			"note",
			"note",
			"canvas",
			"resource",
		]);
	});

	it("limits each group so one cannot crowd out the rest", () => {
		const many: LinkTarget[] = Array.from({ length: 20 }, (_, i) => ({
			kind: "note",
			target: `n${i}`,
			label: `Note ${i}`,
		}));
		const out = searchTargets([...many, ...targets], "", "all", 5);
		expect(out.filter((t) => t.kind === "note")).toHaveLength(5);
		expect(out.some((t) => t.kind === "resource")).toBe(true);
	});

	it("the resources scope only lists resources", () => {
		expect(searchTargets(targets, "sam", "resource")).toEqual([targets[0]]);
	});

	it("needs every typed word to match", () => {
		expect(searchTargets(targets, "sam rive").map((t) => t.target)).toEqual([
			"r1",
		]);
	});
});

describe("backlinks", () => {
	it("lists notes and canvases that link to a target, not the target itself", async () => {
		const host = new MemoryHost();
		await host.writeTextAtomic(
			"b.vnote",
			note("b", "Beta", [link("resource", "sam", "Sam")]),
		);
		await host.writeTextAtomic(
			"a.vnote",
			note("a", "Alpha", [link("resource", "sam", "Sam")]),
		);
		await host.writeTextAtomic(
			"c.vnote",
			note("c", "Canvas one", [link("resource", "sam", "Sam")], {
				kind: "canvas",
			}),
		);
		await host.writeTextAtomic(
			"d.vnote",
			note("d", "Other", [link("note", "zzz")]),
		);
		await host.writeTextAtomic(
			"sam.vnote",
			note("sam", "Self", [link("note", "sam")]),
		);
		expect(await backlinks(host, "sam")).toEqual([
			{ path: "a.vnote", title: "Alpha", kind: "note" },
			{ path: "b.vnote", title: "Beta", kind: "note" },
			{ path: "c.vnote", title: "Canvas one", kind: "canvas" },
		]);
		expect(await backlinks(host, "nobody")).toEqual([]);
	});
});

describe("previewOf", () => {
	it("shows a link as its name", () => {
		expect(
			previewOf([
				{
					id: "a",
					type: "paragraph",
					parent: null,
					content: [
						{ type: "text", text: "call " },
						link("resource", "sam", "Sam Rivera"),
					],
				},
			]),
		).toBe("call Sam Rivera");
	});
});
