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
