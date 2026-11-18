import type { JSONContent } from "@tiptap/core";
import type { OutlineItem } from "./outline";

export interface TocEntry {
	text: string;
	children: TocEntry[];
}

/**
 * The headings as a tree. A heading sits under the nearest heading above it
 * with a lower level, so an H3 after an H1 nests under the H1 (the level in
 * between is skipped), and a heading at the same level or higher closes the
 * ones before it.
 */
export function outlineTree(items: OutlineItem[]): TocEntry[] {
	const roots: TocEntry[] = [];
	const open: { level: number; entry: TocEntry }[] = [];
	for (const item of items) {
		while (open.length > 0 && (open.at(-1)?.level ?? 0) >= item.level) {
			open.pop();
		}
		const entry: TocEntry = { text: item.text, children: [] };
		const parent = open.at(-1)?.entry;
		(parent ? parent.children : roots).push(entry);
		open.push({ level: item.level, entry });
	}
	return roots;
}

/**
 * A plain bulletList node of the headings' text, nested as `outlineTree` says.
 * Nothing in it is special: it is an ordinary list the person can edit. Null
 * when the note has no headings to list. The nodes have no ids; the editor
 * gives them when they are inserted.
 */
export function tocList(items: OutlineItem[]): JSONContent | null {
	const tree = outlineTree(items);
	if (tree.length === 0) return null;
	const list = (entries: TocEntry[]): JSONContent => ({
		type: "bulletList",
		content: entries.map((entry) => ({
			type: "listItem",
			content: [
				{ type: "paragraph", content: [{ type: "text", text: entry.text }] },
				...(entry.children.length > 0 ? [list(entry.children)] : []),
			],
		})),
	});
	return list(tree);
}
