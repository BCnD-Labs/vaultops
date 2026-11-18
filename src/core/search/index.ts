/** STOPGAP(search-index): replace with a persistent Rust index if vault size needs it. */
export type SearchField = "title" | "heading" | "tag" | "property" | "body";
export interface SearchNote {
	path: string;
	title: string;
	text?: string;
	headings?: string[];
	properties?: string[];
	tags?: string[];
	updatedAt?: number;
	blockId?: string;
}
export interface SearchHit {
	path: string;
	title: string;
	snippet: string;
	ranges: [number, number][];
	blockId?: string;
	field: SearchField;
}
const fold = (s: string) =>
	s
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLocaleLowerCase();
const words = (s: string) =>
	[...s.matchAll(/[\p{L}\p{N}]+/gu)].map((m) => ({
		text: m[0],
		start: m.index ?? 0,
		end: (m.index ?? 0) + m[0].length,
	}));
type Token = ReturnType<typeof words>[number] & { folded: string };
function distanceOne(a: string, b: string): boolean {
	if (Math.abs(a.length - b.length) > 1) return false;
	let i = 0,
		j = 0,
		edits = 0;
	while (i < a.length && j < b.length) {
		if (a[i] === b[j]) {
			i++;
			j++;
			continue;
		}
		if (++edits > 1) return false;
		if (a.length >= b.length) i++;
		if (b.length >= a.length) j++;
	}
	return edits + (i < a.length || j < b.length ? 1 : 0) <= 1;
}
function matched(q: string, candidate: string): boolean {
	return (
		candidate.startsWith(q) || (q.length >= 5 && distanceOne(q, candidate))
	);
}
function tokenize(text: string): Token[] {
	return words(text).map((word) => ({ ...word, folded: fold(word.text) }));
}
function matchText(
	tokens: Token[],
	foldedText: string,
	queryWords: string[],
	phrase?: string,
) {
	if (phrase && !foldedText.includes(fold(phrase))) return null;
	const found: Token[] = [];
	for (const q of queryWords) {
		const hit = tokens.find((w) => matched(q, w.folded));
		if (!hit) return null;
		found.push(hit);
	}
	return found;
}
export function createSearchIndex() {
	type IndexedField = {
		field: SearchField;
		text: string;
		folded: string;
		tokens: Token[];
		weight: number;
	};
	const notes = new Map<string, { note: SearchNote; fields: IndexedField[] }>();
	return {
		add(note: SearchNote) {
			const fields: [SearchField, string, number][] = [
				["title", note.title, 5],
				...(note.headings ?? []).map((x): [SearchField, string, number] => [
					"heading",
					x,
					4,
				]),
				...(note.tags ?? []).map((x): [SearchField, string, number] => [
					"tag",
					x,
					3,
				]),
				...(note.properties ?? []).map((x): [SearchField, string, number] => [
					"property",
					x,
					3,
				]),
				["body", note.text ?? "", 1],
			];
			notes.set(note.path, {
				note,
				fields: fields.map(([field, text, weight]) => ({
					field,
					text,
					weight,
					folded: fold(text),
					tokens: tokenize(text),
				})),
			});
		},
		remove(path: string) {
			notes.delete(path);
		},
		search(query: string): SearchHit[] {
			const phrase = /"([^"]+)"/.exec(query)?.[1];
			const qs = words(query.replace(/"[^"]*"/g, " ")).map((w) => fold(w.text));
			if (phrase) qs.push(...words(phrase).map((w) => fold(w.text)));
			if (!qs.length) return [];
			const hits: (SearchHit & { score: number; updated: number })[] = [];
			for (const { note: n, fields } of notes.values()) {
				let best:
					| {
							field: SearchField;
							text: string;
							weight: number;
							indexes: ReturnType<typeof matchText>;
					  }
					| undefined;
				for (const { field, text, weight, tokens, folded } of fields) {
					const indexes = matchText(tokens, folded, qs, phrase);
					if (indexes && (!best || weight > best.weight))
						best = { field, text, weight, indexes };
				}
				if (!best?.indexes) continue;
				const start = Math.max(
					0,
					Math.min(...best.indexes.map((x) => x.start)) - 45,
				);
				const snippet = best.text.slice(start, start + 140);
				const ranges = best.indexes
					.map(
						(x) =>
							[
								Math.max(0, x.start - start),
								Math.min(snippet.length, x.end - start),
							] as [number, number],
					)
					.filter(([a, b]) => b > a);
				const spread =
					Math.max(...best.indexes.map((word) => word.end)) -
					Math.min(...best.indexes.map((word) => word.start));
				hits.push({
					path: n.path,
					title: n.title,
					snippet: `${start ? "…" : ""}${snippet}${start + 140 < best.text.length ? "…" : ""}`,
					ranges: ranges.map(([a, b]) => [
						a + (start ? 1 : 0),
						b + (start ? 1 : 0),
					]),
					...(n.blockId ? { blockId: n.blockId } : {}),
					field: best.field,
					score: best.weight * 100 + qs.length * 10 - spread / 1000,
					updated: n.updatedAt ?? 0,
				});
			}
			return hits
				.sort((a, b) => b.score - a.score || b.updated - a.updated)
				.map(({ score: _s, updated: _u, ...hit }) => hit);
		},
	};
}
