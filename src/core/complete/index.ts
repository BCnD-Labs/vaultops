export interface CompletionNote {
	id?: string;
	path: string;
	title: string;
	text?: string;
}
const fold = (s: string) =>
	s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
/** Per-note counts let edits replace only the changed note's vocabulary. */
export class WordIndex {
	private notes = new Map<string, Map<string, number>>();
	update(id: string, text: string, title = "") {
		const counts = new Map<string, number>();
		const add = (s: string) => {
			if ([...s].length >= 4) counts.set(s, (counts.get(s) ?? 0) + 1);
		};
		const words = text.match(/\p{L}[\p{L}\p{M}]*/gu) ?? [];
		words.forEach(add);
		// Repeated adjacent words make useful phrases without offering every sentence.
		const phrases = new Map<string, number>();
		for (const match of text.matchAll(
			/(?=([\p{L}\p{M}]{4,} +[\p{L}\p{M}]{4,}))/gu,
		)) {
			const phrase = match[1];
			if (phrase) phrases.set(phrase, (phrases.get(phrase) ?? 0) + 1);
		}
		for (const [phrase, count] of phrases)
			if (count > 1) counts.set(phrase, count);
		if (title.trim()) add(title.trim());
		this.notes.set(id, counts);
	}
	remove(id: string) {
		this.notes.delete(id);
	}
	suggest(prefix: string, current: string): string[] {
		const query = fold(prefix);
		if (query.length < 3) return [];
		const found = new Map<
			string,
			{ word: string; count: number; local: boolean }
		>();
		for (const [id, words] of this.notes)
			for (const [word, count] of words) {
				const key = fold(word);
				if (!key.startsWith(query) || key === query) continue;
				const old = found.get(key);
				found.set(key, {
					word: old?.word ?? word,
					count: (old?.count ?? 0) + count,
					local: old?.local === true || id === current,
				});
			}
		return [...found.values()]
			.sort(
				(a, b) =>
					Number(b.local) - Number(a.local) ||
					b.count - a.count ||
					a.word.length - b.word.length ||
					a.word.localeCompare(b.word),
			)
			.slice(0, 8)
			.map(({ word }) =>
				prefix[0] !== prefix.charAt(0).toLowerCase()
					? word.charAt(0).toUpperCase() + word.slice(1)
					: word,
			);
	}
}
