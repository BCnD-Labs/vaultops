import type { Editor, Range } from "@tiptap/core";
import {
	AtSign,
	CalendarDays,
	ChevronDown,
	Code,
	Columns2,
	Columns3,
	Database,
	Heading1,
	Heading2,
	Heading3,
	Heading4,
	Heading5,
	Heading6,
	LayoutTemplate,
	Link2,
	List,
	ListChecks,
	ListOrdered,
	type LucideIcon,
	Pilcrow,
	Quote,
	Table2,
	ToggleRight,
} from "lucide-react";
import { CALLOUT_ICONS, CALLOUT_TONES } from "./callout";
import { insertColumns } from "./columns";
import { insertDatabase } from "./database/commands";
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

/** Asked of the note's own editor, which opens the template picker beside the caret. */
export const TEMPLATE_EVENT = "vaultops:template";

const HEADINGS: {
	level: 1 | 2 | 3 | 4 | 5 | 6;
	icon: LucideIcon;
	keywords: string[];
}[] = [
	{ level: 1, icon: Heading1, keywords: ["title", "big"] },
	{ level: 2, icon: Heading2, keywords: ["subtitle"] },
	{ level: 3, icon: Heading3, keywords: ["subheading"] },
	{ level: 4, icon: Heading4, keywords: ["subheading"] },
	{ level: 5, icon: Heading5, keywords: ["subheading"] },
	{ level: 6, icon: Heading6, keywords: ["subheading", "smallest"] },
];

/**
 * The menu's items, in order. No separate "task list": several tasks in a row
 * are already a list. "Link" and "Mention" only type `[[` and `@`, which open
 * the link pickers, so the menu teaches the shortcuts.
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
	...HEADINGS.map(
		({ level, icon, keywords }): SlashItem => ({
			id: `heading${level}`,
			section: "Blocks",
			icon,
			hint: "#".repeat(level),
			label: `Heading ${level}`,
			keywords: [`h${level}`, ...keywords],
			run: (e, r) => start(e, r).setNode("heading", { level }).run(),
		}),
	),
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
		label: "Codeblock",
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
		keywords: ["collapse", "expand", "fold", "details", "accordion"],
		run: (e, r) =>
			start(e, r).setNode("paragraph").wrapIn("toggle", { open: true }).run(),
	},
	...([1, 2] as const).map(
		(level): SlashItem => ({
			id: `toggle-heading${level}`,
			section: "Blocks",
			icon: level === 1 ? Heading1 : Heading2,
			label: `Toggle heading ${level}`,
			keywords: [
				"collapse",
				"expand",
				"fold",
				"dropdown",
				"heading",
				`h${level}`,
			],
			run: (e, r) =>
				start(e, r)
					.setNode("heading", { level })
					.wrapIn("toggle", { open: true })
					.run(),
		}),
	),
	{
		id: "switch",
		section: "Blocks",
		icon: ToggleRight,
		label: "Toggle",
		keywords: ["switch", "on", "off", "dim", "done"],
		run: (e, r) => start(e, r).wrapIn("switch", { off: false }).run(),
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
		id: "database",
		label: "Database",
		keywords: ["db", "records", "collection", "properties"],
		section: "Insert",
		icon: Database,
		run: (e, r) => {
			insertDatabase(e, r);
		},
	},
	{
		id: "columns-2",
		label: "2 columns",
		keywords: ["columns", "layout", "side by side", "two"],
		section: "Insert",
		icon: Columns2,
		run: (e, r) => void insertColumns(e, r, 2),
	},
	{
		id: "columns-3",
		label: "3 columns",
		keywords: ["columns", "layout", "side by side", "three"],
		section: "Insert",
		icon: Columns3,
		run: (e, r) => void insertColumns(e, r, 3),
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
	{
		id: "link",
		label: "Link",
		keywords: ["note", "canvas", "resource", "reference", "wiki"],
		section: "Insert",
		icon: Link2,
		hint: "[[",
		run: (e, r) => start(e, r).insertContent("[[").run(),
	},
	{
		id: "mention",
		label: "Mention a resource",
		keywords: ["contact", "person", "at", "resource"],
		section: "Insert",
		icon: AtSign,
		hint: "@",
		run: (e, r) => start(e, r).insertContent("@").run(),
	},
	{
		id: "template",
		label: "Template",
		keywords: ["insert", "starter", "snippet", "boilerplate"],
		section: "Insert",
		icon: LayoutTemplate,
		run: (e, r) => {
			start(e, r).run();
			e.view.dom.dispatchEvent(
				new CustomEvent(TEMPLATE_EVENT, { bubbles: true }),
			);
		},
	},
];

/** The same items grouped by section, in the order of `SLASH_SECTIONS`. */
export const SLASH_ITEMS: SlashItem[] = SLASH_SECTIONS.flatMap((section) =>
	ITEMS.filter((item) => item.section === section),
);

/** Items that make a layout of columns, which only fit on a line of the note itself. */
const isColumns = (item: SlashItem) => item.id.startsWith("columns-");
const isTemplate = (item: SlashItem) => item.id === "template";
const isLink = (item: SlashItem) => item.id === "link" || item.id === "mention";

/**
 * Items whose label or keywords start with what was typed after the slash.
 * `columns: false` (the cursor is inside another block) leaves out the column
 * layouts.
 */
export function filterSlashItems(
	query: string,
	where: {
		columns: boolean;
		templates?: boolean;
		links?: boolean;
	} = { columns: true },
): SlashItem[] {
	const q = query.trim().toLowerCase();
	const all = SLASH_ITEMS.filter(
		(item) =>
			(where.columns || !isColumns(item)) &&
			(where.templates !== false || !isTemplate(item)) &&
			(where.links !== false || !isLink(item)),
	);
	if (q === "") return all;
	// Best match first, so Enter picks what was typed: the label itself, then a
	// word in the label, then a keyword. Ties keep the menu's own order.
	const rank = (item: SlashItem): number => {
		const label = item.label.toLowerCase();
		if (label.startsWith(q)) return 0;
		if (label.split(" ").some((w) => w.startsWith(q))) return 1;
		if (item.keywords.some((k) => k.toLowerCase().startsWith(q))) return 2;
		return -1;
	};
	return all
		.map((item, index) => ({ item, index, rank: rank(item) }))
		.filter((m) => m.rank >= 0)
		.sort((a, b) => a.rank - b.rank || a.index - b.index)
		.map((m) => m.item);
}
