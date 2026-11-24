/**
 * The description a save point starts with (pure): which notes changed, in
 * plain words, so a save point never needs typing. "Edited Trip plan and Book
 * notes", "Added Ideas (+2 more)", "Changed 3 files".
 */

export interface ChangedFile {
	path: string;
	kind: string;
}

const NOTE = /\.vnote$/i;

/** A note's name as shown: the file name without its folder or `.vnote`. */
export const noteName = (path: string): string =>
	(path.split("/").pop() ?? path).replace(NOTE, "");

const verb = (changes: ChangedFile[]): string => {
	const kinds = new Set(
		changes.map((c) =>
			c.kind === "untracked" || c.kind === "added"
				? "added"
				: c.kind === "deleted"
					? "deleted"
					: "edited",
		),
	);
	if (kinds.size === 1 && kinds.has("added")) return "Added";
	if (kinds.size === 1 && kinds.has("deleted")) return "Removed";
	return "Edited";
};

/** A short description of what a save point holds; "" when nothing changed. */
export function savePointSummary(changes: readonly ChangedFile[]): string {
	if (changes.length === 0) return "";
	const notes = changes.filter((c) => NOTE.test(c.path));
	if (notes.length === 0)
		return changes.length === 1
			? `Changed ${noteName(changes[0]?.path ?? "")}`
			: `Changed ${changes.length} files`;
	const names = notes.slice(0, 2).map((c) => noteName(c.path));
	const rest = changes.length - names.length;
	const list =
		names.length === 2 && rest === 0 ? names.join(" and ") : names.join(", ");
	return `${verb(notes)} ${list}${rest > 0 ? ` (+${rest} more)` : ""}`;
}
