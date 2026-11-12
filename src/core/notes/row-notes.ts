/**
 * A database row can be turned into a note (see `linkRowToNote` in
 * src/editor/database). The note's name for a row is made here.
 */

/** The title a note gets for a row's Name: a blank Name is "Untitled", as in the tree. */
export function noteTitleFor(name: string): string {
	return name.trim() === "" ? "Untitled" : name.trim();
}
