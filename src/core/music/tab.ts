/**
 * Guitar and bass tab: reads the plain text tab people already write and paste
 * from the web (`e|---0---|`) and lays it out for drawing. Pure TypeScript; the
 * editor's tab block (src/editor/tab-block.ts) turns the layout into SVG.
 *
 * Positions are text columns: column 0 is the first character after a string's
 * name and opening bar, so the spacing of the text (its rhythm) is kept.
 */

/** A fret number, `x`, `<7>` (harmonic) or `(7)` (ghost note) on one string. */
export interface TabNote {
	string: number;
	col: number;
	text: string;
}

/** Columns in marks are centre columns: halfway along a two-digit fret. */
export type TabMark =
	| {
			kind: "hammer" | "pull" | "slide" | "release";
			string: number;
			from: number;
			to: number;
			down?: boolean;
	  }
	| { kind: "bend"; string: number; col: number; label: string }
	| { kind: "vibrato"; string: number; from: number; to: number };

/** One staff: 4 to 8 string lines with the label line above it. */
export interface TabSystem {
	/** String names, top line (the highest string) first. */
	strings: string[];
	/** Columns of the longest string line. */
	width: number;
	notes: TabNote[];
	marks: TabMark[];
	/** Columns that hold a bar line, in order. */
	bars: number[];
	/** Chord names or other words written on the line just above the staff. */
	labels: { col: number; text: string }[];
}

export interface TabSheet {
	systems: TabSystem[];
	/** Lines that are neither tab nor a label line, as typed (kept in the text). */
	unread: string[];
}

/** Names used when a string line has none, by number of strings, top first. */
const DEFAULT_NAMES: Record<number, string[]> = {
	4: ["G", "D", "A", "E"],
	5: ["G", "D", "A", "E", "B"],
	6: ["e", "B", "G", "D", "A", "E"],
	7: ["e", "B", "G", "D", "A", "E", "B"],
	8: ["e", "B", "G", "D", "A", "E", "B", "F#"],
};

/** A string line's optional name and where its columns start, or null for any other line. */
export function staffHead(
	line: string,
): { name: string; start: number } | null {
	const head = /^\s*([A-Ga-g][#b]?)?\s*[|:]*/.exec(line) as RegExpExecArray;
	const body = line.slice(head[0].length);
	const dashes = body.split("-").length - 1;
	if (dashes < 3 || dashes < body.replace(/\s/g, "").length * 0.25) return null;
	// Three letters in a row are words ("Verse ----"), not tab.
	if (/[a-z]{3}/i.test(body)) return null;
	return { name: head[1] ?? "", start: head[0].length };
}

const centre = (note: TabNote) => note.col + (note.text.length - 1) / 2;

/** "full" for a whole step (two frets), "½" for one fret, "1½" for three. */
export function bendLabel(fret: string, target?: string): string {
	const steps = target ? Number(target) - Number(fret) : 2;
	if (!(steps > 0)) return "";
	const whole = Math.floor(steps / 2);
	if (steps === 2) return "full";
	return `${whole || ""}${steps % 2 ? "½" : ""}`;
}

const FRET = /^(<\d{1,2}>|\(\d{1,2}\)|\d{1,2}|[xX])/;

/** One string line's notes and techniques, added to the system. */
function readString(body: string, string: number, system: TabSystem) {
	let last: TabNote | null = null;
	let pending: {
		kind: "hammer" | "pull" | "slide" | "release";
		down?: boolean;
	} | null = null;
	for (let i = 0; i < body.length; ) {
		const rest = body.slice(i);
		const fret = FRET.exec(rest);
		if (fret) {
			const note = { string, col: i, text: fret[0].toLowerCase() };
			system.notes.push(note);
			if (pending?.kind === "slide" || (pending && last)) {
				// A slide with no note before it slides in from just below.
				const from = last ? centre(last) : note.col - 1.5;
				system.marks.push({ ...pending, string, from, to: centre(note) });
			}
			pending = null;
			last = note;
			i += fret[0].length;
			continue;
		}
		const ch = body[i];
		let step = 1;
		if (ch === "|" && !system.bars.includes(i)) system.bars.push(i);
		else if (ch === "h" || ch === "p")
			pending = { kind: ch === "h" ? "hammer" : "pull" };
		else if (ch === "/" || ch === "\\")
			pending = { kind: "slide", down: ch === "\\" };
		else if (ch === "r") pending = { kind: "release" };
		else if (ch === "b" && last) {
			// The bend's target fret ("7b9") is part of the bend, not a new note.
			const target = /^\d{1,2}/.exec(rest.slice(1))?.[0];
			const label = bendLabel(last.text, target);
			system.marks.push({ kind: "bend", string, col: centre(last), label });
			step += target?.length ?? 0;
		} else if (ch === "~") {
			step = (/^~+/.exec(rest) as RegExpExecArray)[0].length;
			system.marks.push({ kind: "vibrato", string, from: i, to: i + step - 1 });
		}
		i += step;
	}
}

/** Reads tab text: each run of 4 to 8 string lines is one system (one row of tab). */
export function parseTab(text: string): TabSheet {
	const lines = text.split("\n");
	const line = (k: number) => lines[k] ?? "";
	const heads = lines.map(staffHead);
	const used = new Set<number>();
	const systems: TabSystem[] = [];
	for (let i = 0; i < lines.length; ) {
		let end = i;
		while (end < lines.length && heads[end]) end++;
		const count = end - i;
		if (count >= 4 && count <= 8) {
			const above = i > 0 && line(i - 1).trim() ? i - 1 : -1;
			const system: TabSystem = {
				strings: [],
				width: 0,
				notes: [],
				marks: [],
				bars: [],
				labels: [],
			};
			for (let s = 0; s < count; s++) {
				const head = heads[i + s] as { name: string; start: number };
				const body = line(i + s)
					.slice(head.start)
					.trimEnd();
				system.strings.push(head.name || (DEFAULT_NAMES[count]?.[s] ?? ""));
				system.width = Math.max(system.width, body.length);
				readString(body, s, system);
			}
			system.bars.sort((a, b) => a - b);
			if (above >= 0) {
				const start = (heads[i] as { start: number }).start;
				for (const word of line(above).matchAll(/\S+/g)) {
					const col = Math.max(0, (word.index ?? 0) - start);
					system.labels.push({ col, text: word[0] });
				}
			}
			systems.push(system);
			for (let k = above >= 0 ? above : i; k < end; k++) used.add(k);
		}
		i = Math.max(end, i + 1);
	}
	const unread = lines.filter((text, k) => text.trim() && !used.has(k));
	return { systems, unread };
}

/** Drawing sizes in pixels. */
export const TAB = {
	/** Width of one text column. */
	col: 8,
	/** Gap between string lines. */
	string: 12,
	/** Where column 0 starts: room for string names and the TAB clef. */
	left: 46,
	/** Above the top string: room for chord names and technique marks. */
	top: 38,
	bottom: 14,
	/** Gap between rows. */
	gap: 10,
};

/** One drawn row: the columns [start, end) of one system, at height y. */
export interface TabRow {
	system: TabSystem;
	start: number;
	end: number;
	y: number;
	height: number;
}

/** x of a column's centre within its row. */
export function columnX(row: TabRow, col: number): number {
	return TAB.left + (col - row.start + 0.5) * TAB.col;
}

/**
 * Splits each system into rows that fit `width` pixels: after the last bar line
 * that fits, or else at a column no fret number runs through.
 */
export function layoutTab(
	sheet: TabSheet,
	width: number,
): { rows: TabRow[]; height: number } {
	const fit = Math.max(8, Math.floor((width - TAB.left - 8) / TAB.col));
	const rows: TabRow[] = [];
	let y = 0;
	for (const system of sheet.systems) {
		const height =
			TAB.top + (system.strings.length - 1) * TAB.string + TAB.bottom;
		for (let start = 0; start < Math.max(1, system.width); ) {
			let end = Math.min(system.width, start + fit);
			if (end < system.width) {
				const bar = system.bars.filter((b) => b > start && b < end).pop();
				if (bar !== undefined) end = bar + 1;
				else
					while (
						end > start + 1 &&
						system.notes.some((n) => n.col < end && n.col + n.text.length > end)
					)
						end--;
			}
			rows.push({ system, start, end: Math.max(end, start + 1), y, height });
			y += height + TAB.gap;
			start = Math.max(end, start + 1);
		}
	}
	return { rows, height: Math.max(0, y - TAB.gap) };
}
