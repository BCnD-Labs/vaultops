/**
 * Open-note tabs. A tab is just a note path, in the order the tabs were opened;
 * which one is active comes from the note that is open, so there is no second
 * "active" value to keep in step.
 */

/** Add a tab for the note, unless it already has one. */
export function openTab(tabs: string[], path: string): string[] {
	return tabs.includes(path) ? tabs : [...tabs, path];
}

/**
 * Remove a tab. `next` is the tab to show instead (the one to the right, else
 * the one to the left), or null when no tab is left or the path had no tab.
 */
export function closeTab(
	tabs: string[],
	path: string,
): { tabs: string[]; next: string | null } {
	const index = tabs.indexOf(path);
	if (index < 0) return { tabs, next: null };
	const rest = tabs.filter((tab) => tab !== path);
	return { tabs: rest, next: rest[index] ?? rest[index - 1] ?? null };
}

/** A renamed or moved note keeps its tab, in the same place. */
export function renameTab(tabs: string[], from: string, to: string): string[] {
	if (from === to || !tabs.includes(from)) return tabs;
	const moved = tabs.map((tab) => (tab === from ? to : tab));
	// If the new path already had a tab, keep only the first of the two.
	return moved.filter((tab, index) => moved.indexOf(tab) === index);
}

/** Keep only tabs whose note still exists (the open note always keeps its tab). */
export function pruneTabs(
	tabs: string[],
	existing: Iterable<string>,
	keep: string | null = null,
): string[] {
	const known = new Set(existing);
	const kept = tabs.filter((tab) => known.has(tab) || tab === keep);
	return kept.length === tabs.length ? tabs : kept;
}

/** Remembers which notes had tabs in each vault, so they come back on restart. */
export interface TabStore {
	get(vault: string): string[];
	set(vault: string, tabs: string[]): void;
}

const key = (vault: string) => `vaultops:tabs:${vault}`;

/** Browser storage can be missing or throw (private windows): then nothing is remembered. */
export function browserTabs(): TabStore {
	return {
		get(vault) {
			try {
				const value: unknown = JSON.parse(
					localStorage.getItem(key(vault)) ?? "[]",
				);
				if (!Array.isArray(value)) return [];
				const paths = value.filter(
					(item): item is string => typeof item === "string" && item !== "",
				);
				return paths.filter((path, index) => paths.indexOf(path) === index);
			} catch {
				return [];
			}
		},
		set(vault, tabs) {
			try {
				localStorage.setItem(key(vault), JSON.stringify(tabs));
			} catch {
				// Not remembering is fine.
			}
		},
	};
}
