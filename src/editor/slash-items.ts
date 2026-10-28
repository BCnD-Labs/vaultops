import type { Editor, Range } from "@tiptap/core";

export interface SlashItem {
	id: string;
	label: string;
	/** Extra words that also find this item. */
	keywords: string[];
	run: (editor: Editor, range: Range) => void;
}

const start = (editor: Editor, range: Range) =>
	editor.chain().focus().deleteRange(range);

/**
 * The menu's items, in order. No separate "task list": several tasks in a row
 * are already a list. The inline date item arrives with the date chip, and
 * "Link to note" with note links.
 */
export const SLASH_ITEMS: SlashItem[] = [
	{
		id: "paragraph",
		label: "Text",
		keywords: ["paragraph", "plain"],
		run: (e, r) => start(e, r).setNode("paragraph").run(),
	},
	{
		id: "heading1",
		label: "Heading 1",
		keywords: ["h1", "title", "big"],
		run: (e, r) => start(e, r).setNode("heading", { level: 1 }).run(),
	},
	{
		id: "heading2",
		label: "Heading 2",
		keywords: ["h2", "subtitle"],
		run: (e, r) => start(e, r).setNode("heading", { level: 2 }).run(),
	},
	{
		id: "bullet",
		label: "Bulleted list",
		keywords: ["bullet", "list", "ul"],
		run: (e, r) => start(e, r).toggleBulletList().run(),
	},
	{
		id: "numbered",
		label: "Numbered list",
		keywords: ["number", "list", "ol"],
		run: (e, r) => start(e, r).toggleOrderedList().run(),
	},
	{
		id: "task",
		label: "Task",
		keywords: ["todo", "checkbox", "check"],
		run: (e, r) => start(e, r).setNode("taskBlock").run(),
	},
	{
		id: "code",
		label: "Code",
		keywords: ["snippet", "pre"],
		run: (e, r) => start(e, r).setCodeBlock().run(),
	},
	{
		id: "quote",
		label: "Quote",
		keywords: ["blockquote", "cite"],
		run: (e, r) => start(e, r).setBlockquote().run(),
	},
];

/** Items whose label or keywords start with what was typed after the slash. */
export function filterSlashItems(query: string): SlashItem[] {
	const q = query.trim().toLowerCase();
	if (q === "") return SLASH_ITEMS;
	const starts = (word: string) => word.toLowerCase().startsWith(q);
	return SLASH_ITEMS.filter(
		(item) =>
			item.label
				.toLowerCase()
				.split(" ")
				.some((w) => w.startsWith(q)) ||
			item.keywords.some(starts) ||
			item.label.toLowerCase().startsWith(q),
	);
}
