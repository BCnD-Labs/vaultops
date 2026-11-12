/**
 * A code block's highlighted lines, stored as one string such as "2,5-7":
 * 1-based line numbers and ranges, ascending and merged. Everything here works
 * on ranges, never on a list of lines, so a huge value like "1-999999999" costs
 * nothing.
 */
export type LineRange = readonly [first: number, last: number];

const MAX_DIGITS = 9;

/**
 * The ranges a stored value names. A value that does not parse (not a string,
 * a bad number, a backwards range) means no highlight at all, and is rewritten
 * the next time the block is edited. The order and overlaps of a valid value
 * do not matter.
 */
export function parseLines(value: unknown): LineRange[] {
	if (typeof value !== "string" || value.trim() === "") return [];
	const found: LineRange[] = [];
	for (const part of value.split(",")) {
		const match = /^\s*(\d+)\s*(?:-\s*(\d+)\s*)?$/.exec(part);
		if (!match) return [];
		const first = match[1] as string;
		const last = match[2] ?? first;
		if (first.length > MAX_DIGITS || last.length > MAX_DIGITS) return [];
		const a = Number(first);
		const b = Number(last);
		if (a < 1 || b < a) return [];
		found.push([a, b]);
	}
	return merge(found);
}

/** Sorted, with overlapping and touching ranges joined. */
function merge(ranges: readonly LineRange[]): LineRange[] {
	const sorted = [...ranges].sort((x, y) => x[0] - y[0]);
	const out: [number, number][] = [];
	for (const [first, last] of sorted) {
		const prev = out[out.length - 1];
		if (prev && first <= prev[1] + 1) prev[1] = Math.max(prev[1], last);
		else out.push([first, last]);
	}
	return out;
}

/** The stored form of some ranges, or null when none are left. */
export function formatLines(ranges: readonly LineRange[]): string | null {
	const text = merge(ranges)
		.map(([first, last]) => (first === last ? `${first}` : `${first}-${last}`))
		.join(",");
	return text === "" ? null : text;
}

export function isHighlighted(ranges: readonly LineRange[], line: number) {
	return ranges.some(([first, last]) => line >= first && line <= last);
}

/** Only the lines a block still has (1 to `lineCount`). */
export function clipLines(
	ranges: readonly LineRange[],
	lineCount: number,
): LineRange[] {
	const out: LineRange[] = [];
	for (const [first, last] of ranges) {
		if (first > lineCount) continue;
		out.push([first, Math.min(last, lineCount)]);
	}
	return out;
}

/** Turn one line on, or off if it is already on. */
export function toggleLine(
	ranges: readonly LineRange[],
	line: number,
): LineRange[] {
	if (!isHighlighted(ranges, line)) return merge([...ranges, [line, line]]);
	const out: LineRange[] = [];
	for (const [first, last] of ranges) {
		if (line < first || line > last) out.push([first, last]);
		else {
			if (first < line) out.push([first, line - 1]);
			if (line < last) out.push([line + 1, last]);
		}
	}
	return out;
}

/** Turn on every line from one line to another, whichever comes first. */
export function addRange(
	ranges: readonly LineRange[],
	from: number,
	to: number,
): LineRange[] {
	return merge([...ranges, [Math.min(from, to), Math.max(from, to)]]);
}

/**
 * What a block's `highlight` should hold after its text changed: the stored
 * value with lines that no longer exist dropped, in the usual form, or null.
 */
export function normalizeHighlight(
	value: unknown,
	lineCount: number,
): string | null {
	return formatLines(clipLines(parseLines(value), lineCount));
}
