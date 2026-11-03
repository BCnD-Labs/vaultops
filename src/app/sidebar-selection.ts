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
