import type { JSONContent } from "@tiptap/core";

export interface OutlineItem {
	/** The heading block's id; null if it has none yet (it cannot be jumped to). */
	id: string | null;
	level: number;
	text: string;
}

function textOf(node: JSONContent): string {
	if (node.type === "text") return node.text ?? "";
	// A link reads as the name it shows.
	if (node.type === "noteLink") return String(node.attrs?.label ?? "");
	return (node.content ?? []).map(textOf).join("");
}

/**
 * The note's headings in reading order, with their level and plain text.
 * Headings inside other blocks (a callout, a quote) are included. Empty
 * headings are left out, since there is nothing to show or look for.
 */
export function outlineOf(doc: JSONContent | null | undefined): OutlineItem[] {
	const items: OutlineItem[] = [];
	const walk = (node: JSONContent) => {
		if (node.type === "heading") {
			const text = textOf(node).trim();
			if (text) {
				items.push({
					id: typeof node.attrs?.id === "string" ? node.attrs.id : null,
					level: typeof node.attrs?.level === "number" ? node.attrs.level : 1,
					text,
				});
			}
			return;
		}
		for (const child of node.content ?? []) walk(child);
	};
	if (doc) walk(doc);
	return items;
}
