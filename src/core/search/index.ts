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
type IndexedField = {
	field: SearchField;
	text: string;
	folded: string;
	tokens: Token[];
	weight: number;
};
export function createSearchIndex() {
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
			const foldedPhrase = phrase ? fold(phrase) : undefined;
			const hits: (SearchHit & { score: number; updated: number })[] = [];
			for (const { note: n, fields } of notes.values()) {
				if (
					foldedPhrase &&
					!fields.some((f) => f.folded.includes(foldedPhrase))
				)
					continue;
				// Every query word must match somewhere in the note, in any field;
				// each word counts at the weight of the best field it is found in.
				let score = 0;
				let missing = false;
				for (const q of qs) {
					let weight = 0;
					for (const f of fields)
						if (f.weight > weight && f.tokens.some((w) => matched(q, w.folded)))
							weight = f.weight;
					if (weight === 0) {
						missing = true;
						break;
					}
					score += weight;
				}
				if (missing) continue;
				// The snippet comes from the field holding the most query words
				// (the phrase first), heavier fields winning ties.
				let best: { field: IndexedField; found: Token[] } | undefined;
				for (const f of fields) {
					if (foldedPhrase && !f.folded.includes(foldedPhrase)) continue;
					const found = qs.flatMap((q) => {
						const hit = f.tokens.find((w) => matched(q, w.folded));
						return hit ? [hit] : [];
					});
					if (
						found.length > 0 &&
						(!best ||
							found.length > best.found.length ||
							(found.length === best.found.length &&
								f.weight > best.field.weight))
					)
						best = { field: f, found };
				}
				if (!best) continue;
				const text = best.field.text;
				const start = Math.max(
					0,
					Math.min(...best.found.map((x) => x.start)) - 45,
				);
				const snippet = text.slice(start, start + 140);
				const lead = start ? 1 : 0;
				const ranges = best.found
					.map(
						(x) =>
							[
								Math.max(0, x.start - start) + lead,
								Math.min(snippet.length, x.end - start) + lead,
							] as [number, number],
					)
					.filter(([a, b]) => b > a);
				const spread =
					Math.max(...best.found.map((word) => word.end)) -
					Math.min(...best.found.map((word) => word.start));
				hits.push({
					path: n.path,
					title: n.title,
					snippet: `${start ? "…" : ""}${snippet}${start + 140 < text.length ? "…" : ""}`,
					ranges,
					...(n.blockId ? { blockId: n.blockId } : {}),
					field: best.field.field,
					score: score * 100 + best.found.length * 10 - spread / 1000,
					updated: n.updatedAt ?? 0,
				});
			}
			return hits
				.sort((a, b) => b.score - a.score || b.updated - a.updated)
				.map(({ score: _s, updated: _u, ...hit }) => hit);
		},
	};
}
