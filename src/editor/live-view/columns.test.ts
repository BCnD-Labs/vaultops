import { expect, it } from "vitest";
import { ensureOption } from "../database/model";
import { cellEdit, cellToValue, propToColumn } from "./columns";

const shelf = {
	name: "Shelf",
	type: "select" as const,
	value: "Reading",
	options: ["Reading"],
};

it("stores a new select option by name and adds it to the property's options", () => {
	const made = ensureOption(propToColumn("prop:Shelf", "Shelf", shelf), "Done");
	const value = cellToValue(made.column, made.optionId);
	expect(value).toBe("Done");
	const props = {
		Shelf: { type: "select", value: "Reading", options: ["Reading"] },
	};
	expect(cellEdit(made.column, value)(props)).toEqual({
		ok: true,
		props: {
			Shelf: { type: "select", value: "Done", options: ["Reading", "Done"] },
		},
	});
});

it("adds a missing property with the column's type, and leaves unknown ones alone", () => {
	const pages = propToColumn("prop:Pages", "Pages", {
		name: "Pages",
		type: "number",
		value: 1,
	});
	expect(cellEdit(pages, 12)({})).toEqual({
		ok: true,
		props: { Pages: { type: "number", value: 12 } },
	});
	expect(cellEdit(pages, 12)({ pages: { type: "rating", value: 4 } }).ok).toBe(
		false,
	);
});
