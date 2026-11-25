/**
 * Three-way merge of a line of plain text, word by word (pure), using the
 * `diff` library. Each side's edits are worked out against the common base;
 * when they touch different words they are both applied, and when they touch
 * the same words (or insert at the same spot) the result is null, so the
 * caller keeps both versions instead.
 */
import { diffArrays } from "diff";

/** Words and the spaces between them, so spacing survives the merge. */
export const tokens = (text: string): string[] =>
	text.match(/\s+|[^\s]+/g) ?? [];

interface Edit {
	/** Base tokens [start, end) replaced by `insert`. */
	start: number;
	end: number;
	insert: string[];
}

function edits(base: string[], side: string[]): Edit[] {
	const out: Edit[] = [];
	let at = 0;
	let pending: Edit | null = null;
	for (const part of diffArrays(base, side)) {
		if (!part.added && !part.removed) {
			if (pending) out.push(pending);
			pending = null;
			at += part.count ?? part.value.length;
			continue;
		}
		pending ??= { start: at, end: at, insert: [] };
		if (part.removed) {
			at += part.count ?? part.value.length;
			pending.end = at;
		} else pending.insert.push(...part.value);
	}
	if (pending) out.push(pending);
	return out;
}

const overlaps = (a: Edit, b: Edit) =>
	a.start < b.end && b.start < a.end
		? true
		: // Two insertions (or an insertion at an edge) at the same spot clash.
			a.start === b.start || a.end === b.end
			? a.start === a.end || b.start === b.end || a.start === b.start
			: false;

/** The merged text, or null when both sides changed the same words. */
export function mergeWords(
	base: string,
	mine: string,
	theirs: string,
): string | null {
	if (mine === theirs) return mine;
	if (mine === base) return theirs;
	if (theirs === base) return mine;
	const b = tokens(base);
	const m = edits(b, tokens(mine));
	const t = edits(b, tokens(theirs));
	for (const x of m)
		for (const y of t)
			if (overlaps(x, y)) {
				const same =
					x.start === y.start &&
					x.end === y.end &&
					x.insert.join("") === y.insert.join("");
				if (!same) return null;
			}
	// Apply from the end so earlier positions stay valid; identical edits once.
	const all = [
		...m,
		...t.filter(
			(y) =>
				!m.some(
					(x) =>
						x.start === y.start &&
						x.end === y.end &&
						x.insert.join("") === y.insert.join(""),
				),
		),
	];
	all.sort((a, z) => z.start - a.start || z.end - a.end);
	const out = [...b];
	for (const e of all) out.splice(e.start, e.end - e.start, ...e.insert);
	return out.join("");
}
