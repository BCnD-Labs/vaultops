import type { MatchRow } from "./match";
import { propName, type SortKey } from "./rule";

type Key = string | number | boolean | null;

/**
 * Text as it sorts: no accents, no capitals, and numbers padded so "Note 9"
 * comes before "Note 10". Plain `<` on these is many times faster than a
 * collator, which keeps 10,000-row views quick.
 */
export function textKey(text: string): string {
	return text
		.normalize("NFD")
		.replace(/\p{M}/gu, "")
		.toLowerCase()
		.replace(/\d+/g, (digits) => digits.padStart(12, "0"));
}

function sortValue(row: MatchRow, field: string): Key {
	if (field === "title") return textKey(row.title);
	if (field === "type") return row.type ? textKey(row.type) : null;
	const f = row.fields[(propName(field) ?? "").toLowerCase()];
	const v = f?.value;
	if (v === undefined || v === null || v === "") return null;
	if (Array.isArray(v)) return v.length === 0 ? null : textKey(v.join(", "));
	return typeof v === "string" ? textKey(v) : v;
}

/** Rows are never changed in place (a change makes a new row), so keys can be kept. */
const cache = new WeakMap<MatchRow, Map<string, Key>>();

function keyOf(row: MatchRow, field: string): Key {
	let keys = cache.get(row);
	if (!keys) {
		keys = new Map();
		cache.set(row, keys);
	}
	let key = keys.get(field);
	if (key === undefined) {
		key = sortValue(row, field);
		keys.set(field, key);
	}
	return key;
}

function compareKeys(a: Key, b: Key): number {
	if (typeof a !== typeof b) return typeof a < typeof b ? -1 : 1;
	return a === b ? 0 : (a as string) < (b as string) ? -1 : 1;
}

/**
 * Rows in the order of the sort keys. Empty values go last whatever the
 * direction; ties fall back to title, then path, so the order is stable.
 * With a `limit`, only the first rows are found (a view shows 200 at a time).
 */
export function sortRows<R extends MatchRow>(
	rows: readonly R[],
	keys: SortKey[],
	limit = rows.length,
): R[] {
	const fields = [...keys.map((k) => k.field), "title"];
	const dirs = [...keys.map((k) => (k.dir === "desc" ? -1 : 1)), 1];
	const n = fields.length;
	const decorated = rows.map((row) => ({
		row,
		keys: fields.map((field) => keyOf(row, field)),
	}));
	type D = (typeof decorated)[number];
	const compare = (a: D, b: D): number => {
		for (let i = 0; i < n; i++) {
			const x = a.keys[i] as Key;
			const y = b.keys[i] as Key;
			if (x === y) continue;
			if (x === null || y === null) return x === null ? 1 : -1;
			return compareKeys(x, y) * (dirs[i] as number);
		}
		return a.row.path < b.row.path ? -1 : a.row.path > b.row.path ? 1 : 0;
	};
	if (limit >= decorated.length)
		return decorated.sort(compare).map((d) => d.row);
	// Keep only the best `limit`, in order: most rows lose to the last one at once.
	const top: D[] = [];
	for (const d of decorated) {
		const last = top[limit - 1];
		if (last && compare(d, last) >= 0) continue;
		let lo = 0;
		let hi = top.length;
		while (lo < hi) {
			const mid = (lo + hi) >> 1;
			if (compare(top[mid] as D, d) <= 0) lo = mid + 1;
			else hi = mid;
		}
		top.splice(lo, 0, d);
		if (top.length > limit) top.pop();
	}
	return top.map((d) => d.row);
}

export interface Group<R> {
	/** Lower-cased value, or null for "No value". */
	key: string | null;
	/** The first spelling seen. */
	label: string;
	rows: R[];
}

function groupValues(row: MatchRow, field: string): string[] {
	if (field === "tag") return row.tags;
	if (field === "type") return row.type ? [row.type] : [];
	const v = row.fields[(propName(field) ?? "").toLowerCase()]?.value;
	if (Array.isArray(v)) return v;
	if (v === undefined || v === null || v === "") return [];
	return [String(v)];
}

/**
 * Rows split by a field, keeping their order inside each group. A note with
 * two tags (or list items) is in both groups. Groups are sorted by name, and
 * "No value" comes last.
 */
export function groupRows<R extends MatchRow>(
	rows: readonly R[],
	field: string,
): Group<R>[] {
	const groups = new Map<string | null, Group<R>>();
	for (const row of rows) {
		const values = groupValues(row, field);
		for (const value of values.length === 0 ? [null] : values) {
			const key = value === null ? null : value.toLowerCase();
			let group = groups.get(key);
			if (!group) {
				group = { key, label: value ?? "No value", rows: [] };
				groups.set(key, group);
			}
			if (group.rows[group.rows.length - 1] !== row) group.rows.push(row);
		}
	}
	return [...groups.values()].sort((a, b) =>
		a.key === null
			? 1
			: b.key === null
				? -1
				: compareKeys(textKey(a.label), textKey(b.label)),
	);
}
