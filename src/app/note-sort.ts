import type { NoteSort } from "../core/notes/list";

/** Persistence is optional, including when access to localStorage throws. */
export function noteSort(next?: NoteSort): NoteSort {
	try {
		if (next) localStorage.setItem("vaultops:note-sort", next);
		const value = next ?? localStorage.getItem("vaultops:note-sort");
		if (value === "name-asc" || value === "name-desc") return value;
	} catch {
		// Sorting still works without persistence.
	}
	return next ?? "name-asc";
}
