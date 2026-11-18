export interface DocumentRow {
	path: string;
	id?: string;
	readOnly: boolean;
}

/** Index only IDs with one healthy claimant. Damaged copies still count. */
export function indexDocumentIds(rows: readonly DocumentRow[]) {
	const paths = new Map<string, string>();
	const seen = new Set<string>();
	for (const { id, path, readOnly } of rows) {
		if (!id) continue;
		if (seen.has(id)) paths.delete(id);
		else if (!readOnly) paths.set(id, path);
		seen.add(id);
	}
	return paths;
}
