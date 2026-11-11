import { notesWithTag, type TaggedRow } from "../core/notes/tags";

export type Selection =
	| { kind: "all" }
	| { kind: "folder" | "tag"; value: string };
export const folderOf = (path: string) =>
	path.split("/").slice(0, -1).join("/");
export const selectionForPath = (path: string): Selection => ({
	kind: "folder",
	value: folderOf(path),
});
export function selectedNotes<T extends TaggedRow>(
	rows: T[],
	selection: Selection,
): T[] {
	if (selection.kind === "tag") return notesWithTag(rows, selection.value);
	return selection.kind === "all"
		? rows
		: rows.filter((row) => folderOf(row.path) === selection.value);
}

type Preferences = {
	orientation: "horizontal" | "vertical";
	sizes: Record<string, number>;
};
const defaults: Preferences = {
	orientation: "vertical",
	sizes: { navigation: 50, notes: 50 },
};
export function sidebarPreferences(next?: Preferences): Preferences {
	try {
		if (next) localStorage.setItem("vaultops:sidebar", JSON.stringify(next));
		const value =
			next ?? JSON.parse(localStorage.getItem("vaultops:sidebar") ?? "null");
		if (
			value &&
			["horizontal", "vertical"].includes(value.orientation) &&
			[value.sizes?.navigation, value.sizes?.notes].every(
				(n) =>
					typeof n === "number" && Number.isFinite(n) && n >= 10 && n <= 90,
			) &&
			Math.abs(value.sizes.navigation + value.sizes.notes - 100) < 0.01
		)
			return value;
	} catch {
		/* Optional persistence, including unavailable storage. */
	}
	return next ?? defaults;
}

export type SidebarMode = "tree" | "navigator";
const modeKey = "vaultops:sidebar-mode";
/**
 * Which sidebar layout is shown: the plain folder tree (default) or the
 * notebook-navigator style split of folders and a notes list. Pass a value to
 * store it; storage that is unavailable or holds anything else gives the tree.
 */
export function sidebarMode(next?: SidebarMode): SidebarMode {
	try {
		if (next) localStorage.setItem(modeKey, next);
		return (next ?? localStorage.getItem(modeKey)) === "navigator"
			? "navigator"
			: "tree";
	} catch {
		return next ?? "tree";
	}
}
