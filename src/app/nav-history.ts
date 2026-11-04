/**
 * Back and forward through the notes that were opened, like a browser. It is a
 * list of note paths plus the position in it. Opening a note while standing in
 * the middle drops the "forward" part, as browsers do.
 */
export interface NavHistory {
	entries: string[];
	/** Position of the current entry; -1 while the list is empty. */
	index: number;
}

export const EMPTY_NAV: NavHistory = { entries: [], index: -1 };

/** Oldest entries fall off past this many. */
export const NAV_LIMIT = 100;

export const canGoBack = (history: NavHistory): boolean => history.index > 0;
export const canGoForward = (history: NavHistory): boolean =>
	history.index >= 0 && history.index < history.entries.length - 1;

/** Record opening a note. Opening the note that is already current changes nothing. */
export function visit(history: NavHistory, path: string): NavHistory {
	if (history.entries[history.index] === path) return history;
	const entries = [...history.entries.slice(0, history.index + 1), path];
	const extra = Math.max(0, entries.length - NAV_LIMIT);
	return { entries: entries.slice(extra), index: entries.length - extra - 1 };
}

/** Move one step back (-1) or forward (1); null when there is nowhere to go. */
export function step(
	history: NavHistory,
	direction: -1 | 1,
): { history: NavHistory; path: string } | null {
	const index = history.index + direction;
	const path = history.entries[index];
	if (path === undefined || index < 0) return null;
	return { history: { ...history, index }, path };
}

/**
 * Rebuild the list with each path mapped to a new one (or null to drop it).
 * Neighbors that end up the same collapse into one, and the position stays on
 * the same entry, or the nearest earlier one that is left.
 */
function rebuild(
	history: NavHistory,
	map: (path: string) => string | null,
): NavHistory {
	const entries: string[] = [];
	const at: number[] = [];
	for (const old of history.entries) {
		const path = map(old);
		if (path === null) at.push(-1);
		else {
			if (entries[entries.length - 1] !== path) entries.push(path);
			at.push(entries.length - 1);
		}
	}
	let index = -1;
	for (let i = Math.min(history.index, at.length - 1); i >= 0; i--) {
		const found = at[i];
		if (found !== undefined && found >= 0) {
			index = found;
			break;
		}
	}
	if (index < 0 && entries.length > 0) index = 0;
	return { entries, index };
}

/** A renamed or moved note keeps its place in the history. */
export function renameEntry(
	history: NavHistory,
	from: string,
	to: string,
): NavHistory {
	if (from === to || !history.entries.includes(from)) return history;
	return rebuild(history, (path) => (path === from ? to : path));
}

/** Forget notes that no longer exist. */
export function pruneEntries(
	history: NavHistory,
	existing: Iterable<string>,
): NavHistory {
	const known = new Set(existing);
	if (history.entries.every((path) => known.has(path))) return history;
	return rebuild(history, (path) => (known.has(path) ? path : null));
}
