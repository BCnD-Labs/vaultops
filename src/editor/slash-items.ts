import type { Editor, Range } from "@tiptap/core";
import {
	CalendarDays,
	ChevronDown,
	Code,
	Heading1,
	Heading2,
	List,
	ListChecks,
	ListOrdered,
	type LucideIcon,
	Pilcrow,
	Quote,
	Table2,
} from "lucide-react";
import { CALLOUT_ICONS, CALLOUT_TONES } from "./callout";
import { todayIso } from "./date-chip";
import { DIVIDER_ICONS } from "./divider-icons";

/** The groups the menu is divided into, in the order they appear. */
export const SLASH_SECTIONS = [
	"Blocks",
	"Lists",
	"Callouts",
	"Insert",
] as const;
export type SlashSection = (typeof SLASH_SECTIONS)[number];

export interface SlashItem {
	id: string;
	label: string;
	/** Extra words that also find this item. */
	keywords: string[];
	section: SlashSection;
	icon: LucideIcon;
	/** The typed shortcut that makes the same block, shown at the right. */
	hint?: string;
	run: (editor: Editor, range: Range) => void;
}

const start = (editor: Editor, range: Range) =>
	editor.chain().focus().deleteRange(range);

/**
 * The menu's items, in order. No separate "task list": several tasks in a row
 * are already a list. "Link to note" arrives with note links.
 */
const ITEMS: SlashItem[] = [
	{
		id: "paragraph",
		section: "Blocks",
		icon: Pilcrow,
		label: "Text",
		keywords: ["paragraph", "plain"],
		run: (e, r) => start(e, r).setNode("paragraph").run(),
	},
	{
		id: "heading1",
		section: "Blocks",
		icon: Heading1,
		hint: "#",
		label: "Heading 1",
		keywords: ["h1", "title", "big"],
		run: (e, r) => start(e, r).setNode("heading", { level: 1 }).run(),
	},
	{
		id: "heading2",
		section: "Blocks",
		icon: Heading2,
		hint: "##",
		label: "Heading 2",
		keywords: ["h2", "subtitle"],
		run: (e, r) => start(e, r).setNode("heading", { level: 2 }).run(),
	},
	{
		id: "bullet",
		section: "Lists",
		icon: List,
		hint: "-",
		label: "Bulleted list",
		keywords: ["bullet", "list", "ul"],
		run: (e, r) => start(e, r).toggleBulletList().run(),
	},
	{
		id: "numbered",
		section: "Lists",
		icon: ListOrdered,
		hint: "1.",
		label: "Numbered list",
		keywords: ["number", "list", "ol"],
		run: (e, r) => start(e, r).toggleOrderedList().run(),
	},
	{
		id: "task",
		section: "Lists",
		icon: ListChecks,
		label: "Task",
		keywords: ["todo", "checkbox", "check"],
		run: (e, r) => start(e, r).setNode("taskBlock").run(),
	},
	{
		id: "code",
		section: "Blocks",
		icon: Code,
		hint: "```",
		label: "Code",
		keywords: ["snippet", "pre"],
		run: (e, r) => start(e, r).setCodeBlock().run(),
	},
	{
		id: "quote",
		section: "Blocks",
		icon: Quote,
		hint: ">",
		label: "Quote",
		keywords: ["blockquote", "cite"],
		run: (e, r) => start(e, r).setBlockquote().run(),
	},
	{
		id: "divider",
		section: "Blocks",
		icon: DIVIDER_ICONS.solid,
		label: "Divider",
		keywords: ["rule", "line", "hr", "separator"],
		run: (e, r) =>
			start(e, r)
				.insertContent([{ type: "divider" }, { type: "paragraph" }])
				.run(),
	},
	...(["dashed", "dotted", "thick"] as const).map(
		(style): SlashItem => ({
			id: `divider-${style}`,
			section: "Blocks",
			icon: DIVIDER_ICONS[style],
			label: `Divider: ${style}`,
			keywords: [style, "separator"],
			run: (e, r) =>
				start(e, r)
					.insertContent([
						{ type: "divider", attrs: { style } },
						{ type: "paragraph" },
					])
					.run(),
		}),
	),
	{
		id: "toggle",
		section: "Blocks",
		icon: ChevronDown,
		label: "Dropdown",
		keywords: ["toggle", "collapse", "expand", "fold", "details", "accordion"],
		run: (e, r) =>
			start(e, r).setNode("paragraph").wrapIn("toggle", { open: true }).run(),
	},
	...CALLOUT_TONES.map(
		(tone): SlashItem => ({
			id: `callout-${tone}`,
			label: tone === "note" ? "Callout" : `Callout: ${tone}`,
			keywords: ["callout", "box", "admonition", tone],
			section: "Callouts",
			icon: CALLOUT_ICONS[tone],
			run: (e, r) => start(e, r).wrapIn("callout", { tone }).run(),
		}),
	),
	{
		id: "table",
		label: "Table",
		keywords: ["grid", "rows", "columns", "spreadsheet"],
		section: "Insert",
		icon: Table2,
		run: (e, r) =>
			start(e, r).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
	},
	{
		id: "date",
		label: "Date",
		keywords: ["today", "calendar", "day"],
		section: "Insert",
		icon: CalendarDays,
		run: (e, r) =>
			start(e, r)
				.insertContent([{ type: "date", attrs: { date: todayIso() } }])
				.run(),
	},
];

/** The same items grouped by section, in the order of `SLASH_SECTIONS`. */
export const SLASH_ITEMS: SlashItem[] = SLASH_SECTIONS.flatMap((section) =>
	ITEMS.filter((item) => item.section === section),
);

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
