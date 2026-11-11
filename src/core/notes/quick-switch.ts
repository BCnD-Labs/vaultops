export function matchNoteTitles<T extends { title: string; path: string }>(
	rows: readonly T[],
	query: string,
): T[] {
	const needle = query.trim().toLocaleLowerCase();
	if (!needle) return [...rows];
	return rows
		.filter((row) => row.title.toLocaleLowerCase().includes(needle))
		.sort((a, b) => {
			const aPrefix = a.title.toLocaleLowerCase().startsWith(needle);
			const bPrefix = b.title.toLocaleLowerCase().startsWith(needle);
			return Number(bPrefix) - Number(aPrefix);
		});
}

/**
 * The title "Create note" offers: what was typed, unless a note already has
 * exactly that title. Other notes that merely contain it do not stop you
 * creating "Math" next to "Math 101".
 */
export function createRowTitle(
	query: string,
	matches: readonly { title: string }[],
): string | null {
	const title = query.trim();
	if (!title) return null;
	const same = title.toLocaleLowerCase();
	return matches.some((row) => row.title.toLocaleLowerCase() === same)
		? null
		: title;
}

/** A note whose text contains what was typed, with the words around the match. */
export interface TextMatch<T> {
	row: T;
	snippet: string;
}

/**
 * Notes whose body text contains the query (two or more characters), minus
 * the ones in `skip` (title matches are already listed). Each comes with a
 * short snippet around the first match. Titles matched elsewhere never repeat.
 */
export function matchNoteText<
	T extends { path: string; text?: string; kind?: string },
>(
	rows: readonly T[],
	query: string,
	skip: ReadonlySet<string> = new Set(),
	limit = 6,
): TextMatch<T>[] {
	const needle = query.trim().toLocaleLowerCase();
	if (needle.length < 2) return [];
	const out: TextMatch<T>[] = [];
	for (const row of rows) {
		if (out.length >= limit) break;
		if (row.kind === "canvas" || skip.has(row.path) || !row.text) continue;
		const at = row.text.toLocaleLowerCase().indexOf(needle);
		if (at === -1) continue;
		const start = Math.max(0, at - 30);
		const end = Math.min(row.text.length, at + needle.length + 50);
		out.push({
			row,
			snippet:
				(start > 0 ? "…" : "") +
				row.text.slice(start, end) +
				(end < row.text.length ? "…" : ""),
		});
	}
	return out;
}
