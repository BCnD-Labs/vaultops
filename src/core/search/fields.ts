import type { Note } from "../note-format";
import { headerProps } from "../notes/properties";
import { searchTextOf } from "../notes/scan";

/** The heading texts and property values of a note, as the search index reads them. */
export function searchFieldsOf(note: Note): {
	headings: string[];
	properties: string[];
} {
	const headings = note.blocks
		.filter((block) => block.type === "heading")
		.map((block) => searchTextOf([block]))
		.filter(Boolean);
	const properties = Object.values(headerProps(note.header) ?? {}).flatMap(
		(value) => {
			if (!value || typeof value !== "object" || Array.isArray(value))
				return [];
			const raw = value.value;
			if (
				typeof raw === "string" ||
				typeof raw === "number" ||
				typeof raw === "boolean"
			)
				return [String(raw)];
			return Array.isArray(raw)
				? raw.filter((item): item is string => typeof item === "string")
				: [];
		},
	);
	return { headings, properties };
}
