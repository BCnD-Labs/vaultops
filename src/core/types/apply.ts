import type { JsonValue, NoteHeader } from "../note-format";
import {
	cleanName,
	defaultValue,
	findName,
	headerProps,
	type PropertyType,
	type Props,
	withProps,
} from "../notes/properties";
import type { FieldKind, ResourceType } from "../resources/resources";

/**
 * Applying a type to a note (pure: a header in, a header out).
 *
 * A note's type is `resource.type` in its header, the id of a type in
 * `.vaultops/resources/types.json` (the same key resource cards already use).
 * Applying a type sets that key and adds only the fields the note does not
 * have yet, as empty typed properties. It never overwrites a value, never
 * retypes an existing property and never touches the body (it can't: only the
 * header goes in). Removing a type clears the key and keeps every value.
 */

type Obj = { [k: string]: JsonValue };

const isObject = (v: unknown): v is Obj =>
	typeof v === "object" && v !== null && !Array.isArray(v);

/** The property type a field kind is stored as. */
export function propertyTypeOf(kind: FieldKind): PropertyType {
	switch (kind) {
		case "long":
		case "link":
			return "text";
		default:
			return kind;
	}
}

/** The empty property a field starts as on a note. */
function emptyEntry(field: ResourceType["fields"][number]): JsonValue {
	const propType = propertyTypeOf(field.kind);
	const entry: Obj = {
		type: propType,
		value: defaultValue(propType),
	};
	if (propType === "select") entry.options = [...(field.options ?? [])];
	return entry;
}

export interface ApplyResult {
	ok: true;
	header: NoteHeader;
	/** Labels of the fields that were added. */
	added: string[];
	/** Labels whose existing property is of another type: kept, shown as "doesn't match". */
	mismatched: string[];
}

export type ApplyOutcome = ApplyResult | { ok: false; message: string };

/** The id of the note's type, or null. */
export function typeIdOf(header: NoteHeader): string | null {
	const res = (header as { [k: string]: JsonValue }).resource;
	return isObject(res) && typeof res.type === "string" ? res.type : null;
}

/**
 * Give a note a type: set `resource.type` and add the missing fields. Fields
 * the note already has (matched by name, ignoring capitals) are left exactly
 * as they are. Refuses, changing nothing, when the header's `props` or
 * `resource` is in a shape this version can't edit.
 */
export function applyType(
	header: NoteHeader,
	type: ResourceType,
): ApplyOutcome {
	const props = headerProps(header);
	const raw = (header as { [k: string]: JsonValue }).resource;
	if (props === null || (raw !== undefined && !isObject(raw))) {
		return {
			ok: false,
			message:
				"This note's header can't be edited here, so its type was not set.",
		};
	}
	const next: Props = { ...props };
	const added: string[] = [];
	const mismatched: string[] = [];
	for (const f of type.fields) {
		const key = findName(next, f.label);
		if (key === null) {
			next[cleanName(f.label)] = emptyEntry(f);
			added.push(f.label);
			continue;
		}
		const entry = next[key];
		if (!isObject(entry) || entry.type !== propertyTypeOf(f.kind)) {
			mismatched.push(f.label);
		}
	}
	const typed = {
		...(header as { [k: string]: JsonValue }),
		resource: { ...(raw ?? {}), type: type.id },
	} as unknown as NoteHeader;
	return { ok: true, header: withProps(typed, next), added, mismatched };
}

/**
 * Take the type off a note: only `resource.type` goes, so every value stays as
 * an ordinary property. The whole `resource` key goes when nothing else is in it.
 */
export function removeType(header: NoteHeader): NoteHeader {
	const { resource, ...others } = header as { [k: string]: JsonValue };
	if (!isObject(resource) || !("type" in resource)) return header;
	const { type: _type, ...rest } = resource;
	return (
		Object.keys(rest).length > 0 ? { ...others, resource: rest } : others
	) as NoteHeader;
}
