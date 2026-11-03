export function matchNoteTitles<T extends { title: string; path: string }>(
	rows: readonly T[],
	query: string,
): T[] {
	const needle = query.trim().toLocaleLowerCase();
	if (!needle) return [...rows];
	return rows
		.filter((row) => row.title.toLocaleLowerCase().includes(needle))
		.sort((a, b) => {
			const aPrefix = a.title.toLocaleLowerCase().startsWith(needle);
			const bPrefix = b.title.toLocaleLowerCase().startsWith(needle);
			return Number(bPrefix) - Number(aPrefix);
		});
}

export function createRowTitle(
	query: string,
	matches: readonly unknown[],
): string | null {
	const title = query.trim();
	return title && matches.length === 0 ? title : null;
}
