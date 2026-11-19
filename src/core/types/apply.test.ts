import { describe, expect, it } from "vitest";
import {
	NOTE_FORMAT,
	NOTE_FORMAT_VERSION,
	type NoteHeader,
} from "../note-format";
import type { ResourceType } from "../resources/resources";
import { applyType, propertyTypeOf, removeType, typeIdOf } from "./apply";

const book: ResourceType = {
	id: "book",
	name: "Book",
	titleLabel: "Title",
	fields: [
		{ label: "Author", kind: "text", required: false },
		{ label: "Year", kind: "number", required: false },
		{
			label: "Status",
			kind: "select",
			required: false,
			options: ["To read", "Done"],
		},
		{ label: "Owned", kind: "checkbox", required: false },
		{ label: "Genres", kind: "list", required: false },
		{ label: "Link", kind: "link", required: false },
		{ label: "Notes", kind: "long", required: false },
	],
};

const header = (extra: Record<string, unknown> = {}): NoteHeader =>
	({
		format: NOTE_FORMAT,
		v: NOTE_FORMAT_VERSION,
		noteId: "n1",
		title: "Dune",
		...extra,
	}) as NoteHeader;

function applied(h: NoteHeader, t = book) {
	const r = applyType(h, t);
	if (!r.ok) throw new Error(r.message);
	return r;
}

describe("applyType", () => {
	it("sets the type and adds each field as an empty typed property", () => {
		const r = applied(header());
		expect(typeIdOf(r.header)).toBe("book");
		expect(r.added).toEqual(book.fields.map((f) => f.label));
		expect(r.header.props).toEqual({
			Author: { type: "text", value: "" },
			Year: { type: "number", value: null },
			Status: { type: "select", value: null, options: ["To read", "Done"] },
			Owned: { type: "checkbox", value: false },
			Genres: { type: "list", value: [] },
			Link: { type: "text", value: "" },
			Notes: { type: "text", value: "" },
		});
	});

	it("adds only missing fields and never overwrites a value", () => {
		const props = {
			author: { type: "text", value: "Frank Herbert", color: "red" },
			Year: { type: "number", value: 1965 },
			Status: { type: "select", value: "Done", options: ["Done", "Own list"] },
		};
		const r = applied(header({ props }));
		expect(r.added).toEqual(["Owned", "Genres", "Link", "Notes"]);
		expect(r.header.props).toMatchObject(props);
		expect(Object.keys(r.header.props as object)).not.toContain("Author");
	});

	it("keeps a same-name property of another type and reports it", () => {
		const props = { Status: { type: "text", value: "Reading" } };
		const r = applied(header({ props }));
		expect(r.mismatched).toEqual(["Status"]);
		expect((r.header.props as Record<string, unknown>).Status).toEqual(
			props.Status,
		);
	});

	it("is the same when applied twice", () => {
		const once = applied(header());
		const twice = applied(once.header);
		expect(twice.header).toEqual(once.header);
		expect(twice.added).toEqual([]);
	});

	it("keeps other header keys and resource keys, and does not mutate the input", () => {
		const h = header({
			tags: ["x"],
			resource: { updated: "2026-11-08T00:00:00Z" },
		});
		const copy = structuredClone(h);
		const r = applied(h);
		expect(r.header).toMatchObject({
			tags: ["x"],
			resource: { updated: "2026-11-08T00:00:00Z", type: "book" },
		});
		expect(h).toEqual(copy);
	});

	it("refuses a header it can't edit and changes nothing", () => {
		expect(applyType(header({ props: "oops" }), book).ok).toBe(false);
		expect(applyType(header({ resource: "oops" }), book).ok).toBe(false);
	});

	it("maps each field kind to a property type", () => {
		expect(
			(
				[
					"text",
					"long",
					"link",
					"date",
					"number",
					"select",
					"checkbox",
					"list",
				] as const
			).map(propertyTypeOf),
		).toEqual([
			"text",
			"text",
			"text",
			"date",
			"number",
			"select",
			"checkbox",
			"list",
		]);
	});
});

describe("removeType", () => {
	it("clears only the type and keeps every value", () => {
		const r = applied(
			header({ props: { Author: { type: "text", value: "Ann" } } }),
		);
		const bare = removeType(r.header);
		expect(typeIdOf(bare)).toBeNull();
		expect(bare.props).toEqual(r.header.props);
		expect("resource" in bare).toBe(false);
	});

	it("keeps other resource keys and returns an untyped header as it is", () => {
		const h = header({ resource: { type: "book", updated: "t" } });
		expect(
			(removeType(h) as unknown as { resource: unknown }).resource,
		).toEqual({
			updated: "t",
		});
		const plain = header();
		expect(removeType(plain)).toBe(plain);
	});
});
