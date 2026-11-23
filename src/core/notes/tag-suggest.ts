import type { TaggedRow } from "./tags";

/** A tag already used somewhere in the vault, with how many notes carry it. */
export interface KnownTag {
	tag: string;
	count: number;
}

/**
 * The form two tags are compared in to spot near-duplicates: lower case, and
 * only letters, digits and the `/` between levels. So `School` matches
 * `school`, and `ADD-103` matches `add103` and `Add 103`.
 */
export function tagKey(tag: string): string {
	return tag
		.toLowerCase()
		.replace(/^#+/, "")
		.replace(/[^\p{L}\p{N}/]+/gu, "");
}

/**
 * Every tag in the vault, each spelling once (spellings that differ only in
 * capitals count as one; the first one seen is kept). Most used first, then
 * by name.
 */
export function knownTags(rows: readonly TaggedRow[]): KnownTag[] {
	const byLower = new Map<string, KnownTag>();
	for (const row of rows) {
		const seen = new Set<string>();
		for (const tag of row.tags) {
			const lower = tag.toLowerCase();
			if (seen.has(lower)) continue;
			seen.add(lower);
			const known = byLower.get(lower);
			if (known) known.count++;
			else byLower.set(lower, { tag, count: 1 });
		}
	}
	return [...byLower.values()].sort(
		(a, b) => b.count - a.count || a.tag.localeCompare(b.tag),
	);
}

/**
 * Tags to offer while `draft` is typed: known tags whose key starts with or
 * contains the draft's key, leaving out the ones the note already has. A tag
 * whose key is exactly the draft's comes first (that is the near-duplicate),
 * then the ones that start with it, then the rest; within each, most used first.
 */
export function suggestTags(
	known: readonly KnownTag[],
	draft: string,
	current: readonly string[],
	limit = 8,
): KnownTag[] {
	const key = tagKey(draft);
	if (key === "") return [];
	const have = new Set(current.map((t) => t.toLowerCase()));
	const rank = (k: KnownTag): number => {
		const other = tagKey(k.tag);
		if (other === key) return 0;
		if (other.startsWith(key)) return 1;
		if (other.includes(key)) return 2;
		return 3;
	};
	return known
		.filter((k) => !have.has(k.tag.toLowerCase()))
		.map((k) => ({ k, r: rank(k) }))
		.filter(({ r }) => r < 3)
		.sort((a, b) => a.r - b.r || b.k.count - a.k.count)
		.slice(0, limit)
		.map(({ k }) => k);
}

/** The known tag that `draft` is a different spelling of, if any. */
export function sameTagAs(
	known: readonly KnownTag[],
	draft: string,
): KnownTag | null {
	const key = tagKey(draft);
	if (key === "") return null;
	const trimmed = draft.trim().replace(/^#+/, "");
	return known.find((k) => tagKey(k.tag) === key && k.tag !== trimmed) ?? null;
}
