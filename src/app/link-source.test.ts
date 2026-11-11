import { expect, it, vi } from "vitest";
import { buildLinkSource, linkTargets } from "./link-source";
import type { NoteRow } from "./session";

const row = (over: Partial<NoteRow>): NoteRow => ({
	path: "a.vnote",
	title: "A",
	preview: "",
	readOnly: false,
	tags: [],
	...over,
});

it("lists notes, canvases and cards by their ids, skipping notes that have none", () => {
	const targets = linkTargets(
		[
			row({ id: "n1", title: "Trip", path: "Travel/Trip.vnote" }),
			row({ id: "c1", title: "Map", kind: "canvas" }),
			row({ title: "No id" }),
		],
		[
			{
				path: "p",
				title: "Sam",
				typeId: "contact",
				noteId: "r1",
				updated: "",
				header: { format: "vaultops-note", v: 1, noteId: "r1" },
				blocks: [],
				props: {},
			},
			{
				path: "bad",
				title: "Broken",
				typeId: null,
				noteId: "r2",
				updated: "",
				header: { format: "vaultops-note", v: 1, noteId: "r2" },
				blocks: [],
				props: {},
				problem: "unreadable",
			},
		],
		[{ id: "contact", name: "Contact", titleLabel: "Name", fields: [] }],
	);
	expect(targets).toEqual([
		{ kind: "note", target: "n1", label: "Trip", hint: "Travel" },
		{ kind: "canvas", target: "c1", label: "Map", hint: undefined },
		{ kind: "resource", target: "r1", label: "Sam", hint: "Contact" },
	]);
});

it("names a target by its current title, and null when it is gone", () => {
	const open = vi.fn();
	const source = buildLinkSource(
		[{ kind: "note", target: "n1", label: "Renamed" }],
		open,
	);
	expect(source.describe("note", "n1")).toBe("Renamed");
	expect(source.describe("note", "gone")).toBeNull();
	expect(source.describe("resource", "n1")).toBeNull();
	source.open({ kind: "note", target: "n1", label: "Old" });
	expect(open).toHaveBeenCalledWith({
		kind: "note",
		target: "n1",
		label: "Old",
	});
});

it("tells two cards of the same name apart by type and first detail", () => {
	const card = (noteId: string, org: string) => ({
		path: noteId,
		title: "Sam Rivera",
		typeId: "contact",
		noteId,
		updated: "",
		header: { format: "vaultops-note" as const, v: 1, noteId },
		blocks: [],
		props: { Organization: { type: "text" as const, value: org } },
	});
	const targets = linkTargets(
		[],
		[card("a", "Halden Press"), card("b", "Northwind")],
		[
			{
				id: "contact",
				name: "Contact",
				titleLabel: "Name",
				fields: [{ label: "Organization", kind: "text", required: false }],
			},
		],
	);
	expect(targets.map((t) => t.hint)).toEqual([
		"Contact · Halden Press",
		"Contact · Northwind",
	]);
});
