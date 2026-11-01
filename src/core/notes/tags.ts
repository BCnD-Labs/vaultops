import {
	addProperty,
	cleanName,
	findName,
	type Props,
	setValue,
} from "./properties";

/** A tag is one entry of the list property named `tags`. No inline `#tag`. */
const TAGS = "tags";

/** A tag as stored: trimmed, inner spaces collapsed, no leading `#`. Null if empty. */
export function cleanTag(raw: string): string | null {
	const tag = cleanName(raw.replace(/^[#\s]+/, ""));
	return tag === "" ? null : tag;
}

/** The tags of a note (empty when there is no readable list property `tags`). */
export function tagsOf(props: Props | null): string[] {
	if (!props) return [];
	const key = findName(props, TAGS);
	const entry = key === null ? null : props[key];
	if (
		typeof entry !== "object" ||
		entry === null ||
		Array.isArray(entry) ||
		entry["type"] !== "list" ||
		!Array.isArray(entry["value"])
	) {
		return [];
	}
	return entry["value"].filter((v): v is string => typeof v === "string");
}

export type TagChange =
	| { ok: true; props: Props }
	| { ok: false; message: string };

/** Add a tag (creating the `tags` list if needed). The same tag twice is ignored. */
export function addTag(props: Props, raw: string): TagChange {
	const tag = cleanTag(raw);
	if (tag === null) return { ok: false, message: "Type a tag first." };
	const key = findName(props, TAGS);
	if (key === null) {
		const made = addProperty(props, TAGS, "list");
		return made.ok ? setValue(made.props, TAGS, [tag]) : made;
	}
	const entry = props[key];
	const isList =
		typeof entry === "object" &&
		entry !== null &&
		!Array.isArray(entry) &&
		entry["type"] === "list" &&
		Array.isArray(entry["value"]);
	if (!isList) {
		return {
			ok: false,
			message:
				"This note has a property called tags that isn't a list, so tags can't be added.",
		};
	}
	const current = tagsOf(props);
	if (current.some((t) => t.toLowerCase() === tag.toLowerCase())) {
		return { ok: true, props };
	}
	return setValue(props, key, [...current, tag]);
}

/** Remove a tag (ignoring capital letters). The empty `tags` list stays. */
export function removeTag(props: Props, tag: string): Props {
	const key = findName(props, TAGS);
	if (key === null) return props;
	const rest = tagsOf(props).filter(
		(t) => t.toLowerCase() !== tag.toLowerCase(),
	);
	const next = setValue(props, key, rest);
	return next.ok ? next.props : props;
}

export interface TaggedRow {
	path: string;
	tags: string[];
}

/** Every tag in use with how many notes carry it, by name ignoring capitals. */
export function tagIndex(rows: TaggedRow[]): { tag: string; count: number }[] {
	const seen = new Map<string, { tag: string; count: number }>();
	for (const row of rows) {
		for (const tag of new Set(row.tags.map((t) => t.toLowerCase()))) {
			const first = row.tags.find((t) => t.toLowerCase() === tag) ?? tag;
			const known = seen.get(tag);
			if (known) known.count += 1;
			else seen.set(tag, { tag: first, count: 1 });
		}
	}
	return [...seen.values()].sort((a, b) =>
		a.tag.toLowerCase().localeCompare(b.tag.toLowerCase()),
	);
}

/** The notes that carry a tag (ignoring capital letters). */
export function notesWithTag<T extends TaggedRow>(rows: T[], tag: string): T[] {
	const key = tag.toLowerCase();
	return rows.filter((r) => r.tags.some((t) => t.toLowerCase() === key));
}
