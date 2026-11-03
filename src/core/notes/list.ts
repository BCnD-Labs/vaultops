export type NoteSort = "name-asc" | "name-desc";
type ListRow = { title: string; path: string; preview: string; tags: string[] };

export function matchesNote(note: ListRow, query: string): boolean {
	const term = query.toLowerCase();
	return [note.title, note.preview, ...note.tags].some((text) =>
		text.toLowerCase().includes(term),
	);
}

/** Return a new array; title ties always use the path for a stable order. */
export function sortNotes<T extends ListRow>(rows: T[], sort: NoteSort): T[] {
	return [...rows].sort((a, b) => {
		const title = a.title.toLowerCase().localeCompare(b.title.toLowerCase());
		return (
			(sort === "name-desc" ? -title : title) || a.path.localeCompare(b.path)
		);
	});
}

export function visibleTags(tags: string[]) {
	return { shown: tags.slice(0, 2), overflow: Math.max(0, tags.length - 2) };
}

export type NoteFilter = "All" | "Tagged" | "Untagged";

export function filterNotes<T extends ListRow>(
	rows: T[],
	filter: NoteFilter,
): T[] {
	return rows.filter(
		(note) =>
			filter === "All" || note.tags.length > 0 === (filter === "Tagged"),
	);
}

/** Folder sections are alphabetical; preserve the chosen note order within each. */
export function groupNotes<T extends ListRow>(rows: T[]) {
	const groups = new Map<string, T[]>();
	for (const note of rows) {
		const folder = note.path.split("/").slice(0, -1).join("/");
		const notes = groups.get(folder) ?? [];
		notes.push(note);
		groups.set(folder, notes);
	}
	return [...groups].sort(([a], [b]) => a.localeCompare(b));
}
