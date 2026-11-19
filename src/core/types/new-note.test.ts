import { describe, expect, it } from "vitest";
import { headerProps, readProps } from "../notes/properties";
import type { TemplateEntry } from "../notes/templates";
import type { ResourceType } from "../resources/resources";
import { typeIdOf, withType } from "./apply";
import {
	blankTemplate,
	fieldPrompts,
	findTypeTemplate,
	groupByType,
	typedHeader,
} from "./new-note";

const book: ResourceType = {
	id: "book",
	name: "Book",
	titleLabel: "Title",
	fields: [
		{ label: "Author", kind: "text", required: false },
		{
			label: "Status",
			kind: "select",
			required: false,
			options: ["To read", "Done"],
		},
		{ label: "Owned", kind: "checkbox", required: false },
	],
};

describe("fieldPrompts", () => {
	it("asks one question per field, with select options", () => {
		expect(fieldPrompts(book)).toEqual([
			{ label: "Author", type: "text", options: [], default: "" },
			{
				label: "Status",
				type: "select",
				options: ["To read", "Done"],
				default: null,
			},
			{ label: "Owned", type: "checkbox", options: [], default: false },
		]);
	});
});

describe("typedHeader", () => {
	it("adds the fields, applies answers and sets the type", () => {
		const r = typedHeader(
			book,
			{ Genre: { type: "text", value: "SF" } },
			{ Author: "Herbert", Status: "Done" },
		);
		if (!r.ok) throw new Error(r.message);
		expect(typeIdOf(r.header)).toBe("book");
		expect(r.header.props).toEqual({
			Genre: { type: "text", value: "SF" },
			Author: { type: "text", value: "Herbert" },
			Status: { type: "select", value: "Done", options: ["To read", "Done"] },
			Owned: { type: "checkbox", value: false },
		});
	});

	it("keeps a template's own value for a field", () => {
		const r = typedHeader(book, { author: { type: "text", value: "Anon" } });
		if (!r.ok) throw new Error(r.message);
		expect(headerProps(r.header)?.author).toEqual({
			type: "text",
			value: "Anon",
		});
		expect(headerProps(r.header)).not.toHaveProperty("Author");
	});
});

describe("findTypeTemplate", () => {
	const entry = (path: string, note: object | null = {}) =>
		({ path, note }) as unknown as TemplateEntry;
	it("matches a path or a name under the templates folder", () => {
		const list = [entry(".vaultops/templates/Books/Review.vnote")];
		expect(findTypeTemplate(list, "Books/Review")).toBe(list[0]);
		expect(
			findTypeTemplate(list, ".vaultops/templates/Books/Review.vnote"),
		).toBe(list[0]);
		expect(findTypeTemplate(list, "Other")).toBeNull();
	});
	it("skips a template that could not be read", () => {
		const list = [entry(".vaultops/templates/A.vnote", null)];
		expect(findTypeTemplate(list, "A")).toBeNull();
	});
});

describe("blankTemplate", () => {
	it("is one empty paragraph", () => {
		expect(blankTemplate().blocks).toHaveLength(1);
	});
});

describe("groupByType", () => {
	const props = {
		Notes: { type: "text", value: "x" },
		status: { type: "text", value: "Done" },
		Author: { type: "text", value: "H" },
	};
	it("lists the type's fields first, in its order, and flags a clash", () => {
		const r = groupByType(readProps(props), book);
		expect(r.items.map((i) => i.name)).toEqual(["Author", "status", "Notes"]);
		expect(r.fieldCount).toBe(2);
		expect([...r.mismatched]).toEqual(["status"]);
	});
	it("leaves everything alone without a type", () => {
		const items = readProps(props);
		expect(groupByType(items, undefined)).toEqual({
			items,
			fieldCount: 0,
			mismatched: new Set(),
		});
	});
});

describe("withType", () => {
	it("sets and clears only resource.type", () => {
		const h = { format: "f", v: 1, noteId: "n", resource: { x: 1 } } as never;
		const set = withType(h, "book");
		expect(typeIdOf(set)).toBe("book");
		expect((set as never as { resource: object }).resource).toEqual({
			x: 1,
			type: "book",
		});
		expect(typeIdOf(withType(set, null))).toBeNull();
	});
});
