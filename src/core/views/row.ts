import type { Note } from "../note-format";
import { headerCover } from "../notes/cover";
import {
	headerProps,
	type PropertyType,
	type PropertyValue,
	readProps,
} from "../notes/properties";

/** One readable property of a note, as live views see it. */
export interface ViewField {
	/** The name as stored (views match names ignoring capitals). */
	name: string;
	type: PropertyType;
	value: PropertyValue;
	options?: string[];
}

/** What live views read from a note, on top of what the note list already has. */
export interface ViewFields {
	/** Readable properties by lower-cased name. Unreadable ones are left out. */
	fields: Record<string, ViewField>;
	/** The note's type id (`header.resource.type`), if it has one. */
	type?: string;
	cover?: string;
}

/** The view part of a note, computed where its search fields are. */
export function viewFieldsOf(note: Note): ViewFields {
	const fields: Record<string, ViewField> = {};
	for (const item of readProps(headerProps(note.header) ?? {})) {
		if (!item.known) continue;
		fields[item.name.toLowerCase()] = {
			name: item.name,
			type: item.type,
			value: item.value,
			...(item.options ? { options: item.options } : {}),
		};
	}
	const resource = note.header.resource;
	const type =
		typeof resource === "object" &&
		resource !== null &&
		!Array.isArray(resource) &&
		typeof resource.type === "string" &&
		resource.type !== ""
			? resource.type
			: undefined;
	const cover = headerCover(note.header);
	return {
		fields,
		...(type ? { type } : {}),
		...(cover ? { cover } : {}),
	};
}

/** True when two notes' view parts are the same (cheap enough per save). */
export function sameViewFields(
	a: Partial<ViewFields>,
	b: Partial<ViewFields>,
): boolean {
	return (
		a.type === b.type &&
		a.cover === b.cover &&
		JSON.stringify(a.fields ?? {}) === JSON.stringify(b.fields ?? {})
	);
}
