import type { JsonValue, NoteHeader } from "../note-format";

/**
 * Note properties, stored in the header's free-form `props` (ADR-0002, no
 * format change). Each property is one entry:
 *
 *   "props": { "Due": { "type": "date", "value": "2026-11-05" } }
 *
 * Anything this version does not understand (another type, a value of the wrong
 * shape, extra fields) is kept exactly as it was: only the entry being edited
 * is ever replaced, and only the fields we own (`type`, `value`) inside it.
 */

export const PROPERTY_TYPES = [
	"text",
	"number",
	"date",
	"checkbox",
	"list",
] as const;
export type PropertyType = (typeof PROPERTY_TYPES)[number];

export type PropertyValue = string | number | boolean | string[] | null;

/** The `props` object of a header. */
export type Props = { [name: string]: JsonValue };

export type PropertyItem =
	| { known: true; name: string; type: PropertyType; value: PropertyValue }
	/** Shown as "kept as is": another type, or a value this version can't read. */
	| { known: false; name: string; type: string | null };

type Obj = { [k: string]: JsonValue };

function isObject(value: unknown): value is Obj {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isPropertyType(value: unknown): value is PropertyType {
	return (PROPERTY_TYPES as readonly unknown[]).includes(value);
}

/** An empty value for a new property of this type. */
export function defaultValue(type: PropertyType): PropertyValue {
	switch (type) {
		case "text":
			return "";
		case "checkbox":
			return false;
		case "list":
			return [];
		default:
			return null;
	}
}

function validDate(text: string): boolean {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
	if (!match) return false;
	const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
	const date = new Date(Date.UTC(y, m - 1, d));
	return (
		date.getUTCFullYear() === y &&
		date.getUTCMonth() === m - 1 &&
		date.getUTCDate() === d
	);
}

/** True when `value` has the shape that `type` stores. */
export function fits(
	type: PropertyType,
	value: unknown,
): value is PropertyValue {
	switch (type) {
		case "text":
			return typeof value === "string";
		case "number":
			return (
				value === null || (typeof value === "number" && Number.isFinite(value))
			);
		case "date":
			return value === null || (typeof value === "string" && validDate(value));
		case "checkbox":
			return typeof value === "boolean";
		case "list":
			return Array.isArray(value) && value.every((v) => typeof v === "string");
	}
}

/**
 * The `props` of a header: `{}` when there are none, `null` when the header
 * has `props` in a form that is not an object (then nothing is edited).
 */
export function headerProps(
	header: NoteHeader | undefined | null,
): Props | null {
	const raw = header?.["props"];
	if (raw === undefined) return {};
	return isObject(raw) ? raw : null;
}

/** The header with `props` replaced; no `props` key at all when it is empty. */
export function withProps(header: NoteHeader, props: Props): NoteHeader {
	const { props: _old, ...rest } = header as { [k: string]: JsonValue };
	const next = Object.keys(props).length > 0 ? { ...rest, props } : rest;
	return next as NoteHeader;
}

/** Every property in a header's `props`, in file order. */
export function readProps(props: Props): PropertyItem[] {
	return Object.entries(props).map(([name, entry]): PropertyItem => {
		if (!isObject(entry) || typeof entry["type"] !== "string") {
			return { known: false, name, type: null };
		}
		const type = entry["type"];
		if (isPropertyType(type) && fits(type, entry["value"])) {
			return { known: true, name, type, value: entry["value"] };
		}
		return { known: false, name, type };
	});
}

/** A name as stored: trimmed, inner spaces collapsed. Empty means not allowed. */
export function cleanName(raw: string): string {
	return raw.trim().replace(/\s+/g, " ");
}

/** The stored name that matches `name` ignoring capital letters, if any. */
export function findName(props: Props, name: string): string | null {
	const key = cleanName(name).toLowerCase();
	return Object.keys(props).find((k) => k.toLowerCase() === key) ?? null;
}

export type Change =
	| { ok: true; props: Props }
	| { ok: false; message: string };

/** Add an empty property. Names are unique ignoring capital letters. */
export function addProperty(
	props: Props,
	rawName: string,
	type: PropertyType,
): Change {
	const name = cleanName(rawName);
	if (name === "") return { ok: false, message: "Give the property a name." };
	if (findName(props, name) !== null) {
		return {
			ok: false,
			message: `There is already a property called ${name}.`,
		};
	}
	if (name.toLowerCase() === "tags" && type !== "list") {
		return { ok: false, message: "Tags is always a list." };
	}
	return {
		ok: true,
		props: { ...props, [name]: { type, value: defaultValue(type) } },
	};
}

/**
 * Set a property's value. The value must fit the property's type, and the
 * entry's other fields are kept.
 */
export function setValue(
	props: Props,
	name: string,
	value: PropertyValue,
): Change {
	const entry = props[name];
	if (!isObject(entry) || !isPropertyType(entry["type"])) {
		return { ok: false, message: "This property can't be edited here." };
	}
	if (!fits(entry["type"], value)) {
		return { ok: false, message: "That value doesn't fit this property." };
	}
	return {
		ok: true,
		props: { ...props, [name]: { ...entry, value: value as JsonValue } },
	};
}

/** Remove a property (any type, including ones this version doesn't know). */
export function removeProperty(props: Props, name: string): Props {
	const { [name]: _gone, ...rest } = props;
	return rest;
}

/**
 * Rename a property in place (it keeps its position and everything in its
 * entry). Names stay unique ignoring capital letters, but a change of capitals
 * alone is a rename. `tags` is never renamed, and only a list may be called tags.
 */
export function renameProperty(
	props: Props,
	from: string,
	rawTo: string,
): Change {
	const to = cleanName(rawTo);
	if (!(from in props)) return { ok: false, message: "No such property." };
	if (to === "") return { ok: false, message: "Give the property a name." };
	if (to === from) return { ok: true, props };
	if (from.toLowerCase() === "tags")
		return { ok: false, message: "Tags can't be renamed." };
	const clash = findName(props, to);
	if (clash !== null && clash !== from) {
		return { ok: false, message: `There is already a property called ${to}.` };
	}
	const entry = props[from];
	if (
		to.toLowerCase() === "tags" &&
		!(isObject(entry) && entry["type"] === "list")
	) {
		return { ok: false, message: "Tags is always a list." };
	}
	const next: Props = {};
	for (const [key, value] of Object.entries(props)) {
		next[key === from ? to : key] = value;
	}
	return { ok: true, props: next };
}

function convertValue(value: PropertyValue, to: PropertyType): PropertyValue {
	const text = Array.isArray(value)
		? value.join(", ")
		: typeof value === "string"
			? value
			: typeof value === "number"
				? String(value)
				: "";
	switch (to) {
		case "text":
			return text;
		case "number": {
			const n = text.trim() === "" ? Number.NaN : Number(text);
			return Number.isFinite(n) ? n : null;
		}
		case "date":
			return validDate(text.trim()) ? text.trim() : null;
		case "checkbox":
			return (
				value === true || ["true", "yes", "1"].includes(text.toLowerCase())
			);
		case "list":
			return text
				.split(",")
				.map((part) => part.trim())
				.filter((part) => part !== "")
				.filter((part, i, all) => all.indexOf(part) === i);
	}
}

/**
 * Change a property's type, carrying the value over when it still makes sense
 * (text to number, a list to text, and so on) and starting empty when it does
 * not. The entry's other fields are kept. `tags` stays a list.
 */
export function changeType(
	props: Props,
	name: string,
	type: PropertyType,
): Change {
	const entry = props[name];
	if (!isObject(entry) || !isPropertyType(entry["type"])) {
		return { ok: false, message: "This property can't be edited here." };
	}
	if (name.toLowerCase() === "tags" && type !== "list") {
		return { ok: false, message: "Tags is always a list." };
	}
	if (entry["type"] === type) return { ok: true, props };
	const from = readProps({ [name]: entry })[0];
	const carried = from?.known ? convertValue(from.value, type) : null;
	const value = fits(type, carried) ? carried : defaultValue(type);
	return {
		ok: true,
		props: { ...props, [name]: { ...entry, type, value: value as JsonValue } },
	};
}
