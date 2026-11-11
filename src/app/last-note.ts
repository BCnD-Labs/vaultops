/** Remembers which note was open in each vault, so the app can reopen it. */
export interface LastNoteStore {
	get(vault: string): string | null;
	set(vault: string, path: string): void;
}

const key = (vault: string) => `vaultops:last-note:${vault}`;

/** Browser storage can be missing or throw (private windows): then nothing is remembered. */
export function browserLastNote(): LastNoteStore {
	return {
		get(vault) {
			try {
				return localStorage.getItem(key(vault));
			} catch {
				return null;
			}
		},
		set(vault, path) {
			try {
				localStorage.setItem(key(vault), path);
			} catch {
				// Not remembering is fine.
			}
		},
	};
}

/** The remembered note if it is still in the list, else the first note, else null. */
export function pickInitialNote(
	paths: string[],
	remembered: string | null,
): string | null {
	if (remembered !== null && paths.includes(remembered)) return remembered;
	return paths[0] ?? null;
}
