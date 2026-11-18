import type { Editor, Range } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import {
	AtSign,
	CalendarDays,
	ChartNoAxesGantt,
	ChartPie,
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
	Image,
	LayoutTemplate,
	Link2,
	List,
	ListChecks,
	ListOrdered,
	ListTree,
	type LucideIcon,
	MessagesSquare,
	Milestone,
	Pilcrow,
	Quote,
	Sigma,
	Table2,
	TableOfContents,
	ToggleRight,
	Workflow,
} from "lucide-react";
import { CALLOUT_ICONS, CALLOUT_TONES } from "./callout";
import { insertColumns } from "./columns";
import { insertDatabase } from "./database/commands";
import { todayIso } from "./date-chip";
import { DIVIDER_ICONS } from "./divider-icons";
import { chooseImage } from "./image-block";
import { insertMathBlock } from "./math-block";
import { insertTableOfContents } from "./table-of-contents";

/** The groups the menu is divided into, in the order they appear. */
export const SLASH_SECTIONS = [
	"Recent",
	"Write",
	"Organise",
	"Plan",
	"Visual",
	"Media",
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
	/** The Settings > Features id that switches this item off (see core/features/registry.ts). */
	feature?: string;
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

const DIAGRAM_STARTERS = [
	[
		"flowchart",
		"Flowchart",
		Workflow,
		`flowchart LR
    Idea --> Draft
    Draft --> Publish`,
	],
	[
		"sequence",
		"Sequence diagram",
		MessagesSquare,
		`sequenceDiagram
    Sam->>Alex: Meet for lunch?
    Alex-->>Sam: See you at noon!`,
	],
	[
		"mindmap",
		"Mind map",
		ListTree,
		`mindmap
  root((Picnic))
    Sandwiches
    Lemonade
    Blanket`,
	],
	[
		"timeline",
		"Timeline",
		Milestone,
		`timeline
    Morning : Pack a bag
    Afternoon : Walk the trail
    Evening : Head home`,
	],
	[
		"gantt",
		"Gantt chart",
		ChartNoAxesGantt,
		`gantt
    title Garden weekend
    dateFormat YYYY-MM-DD
    Prepare soil :soil, 2026-04-04, 1d
    Plant seeds :after soil, 1d`,
	],
	[
		"pie",
		"Pie chart",
		ChartPie,
		`pie title Favorite snacks
    "Apples" : 5
    "Popcorn" : 3
    "Pretzels" : 2`,
	],
] as const;

/**
 * The menu's items, in order. No separate "task list": several tasks in a row
 * are already a list. "Link" and "Mention" only type `[[` and `@`, which open
 * the link pickers, so the menu teaches the shortcuts.
 */
const ITEMS: SlashItem[] = [
	{
		id: "paragraph",
		section: "Write",
		icon: Pilcrow,
		label: "Text",
		keywords: ["paragraph", "plain"],
		run: (e, r) => start(e, r).setNode("paragraph").run(),
	},
	...HEADINGS.map(
		({ level, icon, keywords }): SlashItem => ({
			id: `heading${level}`,
			section: "Write",
			icon,
			hint: "#".repeat(level),
			label: `Heading ${level}`,
			keywords: [`h${level}`, ...keywords],
			run: (e, r) => start(e, r).setNode("heading", { level }).run(),
		}),
	),
	{
		id: "bullet",
		section: "Organise",
		icon: List,
		hint: "-",
		label: "Bulleted list",
		keywords: ["bullet", "list", "ul"],
		run: (e, r) => start(e, r).toggleBulletList().run(),
	},
	{
		id: "numbered",
		section: "Organise",
		icon: ListOrdered,
		hint: "1.",
		label: "Numbered list",
		keywords: ["number", "list", "ol"],
		run: (e, r) => start(e, r).toggleOrderedList().run(),
	},
	{
		id: "task",
		section: "Plan",
		icon: ListChecks,
		label: "Task",
		keywords: ["todo", "checkbox", "check"],
		run: (e, r) => start(e, r).setNode("taskBlock").run(),
	},
	{
		id: "code",
		section: "Write",
		icon: Code,
		hint: "```",
		label: "Codeblock",
		keywords: ["snippet", "pre"],
		run: (e, r) => start(e, r).setCodeBlock().run(),
	},
	...DIAGRAM_STARTERS.map(
		([id, label, icon, text]): SlashItem => ({
			id: `mermaid-${id}`,
			label,
			icon,
			section: "Visual",
			feature: "mermaid",
			keywords: ["mermaid", "diagram", id],
			run: (editor, range) =>
				editor
					.chain()
					.focus()
					.command(({ tr, state }) => {
						const block = state.schema.node(
							"codeBlock",
							{ language: "mermaid" },
							state.schema.text(text),
						);
						tr.replaceRangeWith(range.from, range.to, block);
						// A slash inside a paragraph splits it around the new block.
						// The inserted block ends before any following paragraph opens.
						const end = tr.mapping.map(range.to);
						const $end = tr.doc.resolve(end);
						const afterBlock = $end.parent.isTextblock ? $end.before() : end;
						tr.setSelection(TextSelection.create(tr.doc, afterBlock - 1));
						return true;
					})
					.run(),
		}),
	),
	{
		id: "math",
		section: "Write",
		icon: Sigma,
		label: "Math block",
		keywords: ["math", "equation", "formula", "latex", "fraction"],
		feature: "math",
		run: (e, r) => insertMathBlock(e, r),
	},
	{
		id: "quote",
		section: "Write",
		icon: Quote,
		hint: ">",
		label: "Quote",
		keywords: ["blockquote", "cite"],
		run: (e, r) => start(e, r).setBlockquote().run(),
	},
	{
		id: "divider",
		section: "Organise",
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
			section: "Organise",
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
		section: "Organise",
		icon: ChevronDown,
		label: "Dropdown",
		keywords: ["collapse", "expand", "fold", "details", "accordion"],
		run: (e, r) =>
			start(e, r).setNode("paragraph").wrapIn("toggle", { open: true }).run(),
	},
	...([1, 2] as const).map(
		(level): SlashItem => ({
			id: `toggle-heading${level}`,
			section: "Organise",
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
		section: "Organise",
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
			section: "Write",
			icon: CALLOUT_ICONS[tone],
			run: (e, r) => start(e, r).wrapIn("callout", { tone }).run(),
		}),
	),
	{
		id: "table",
		label: "Table",
		keywords: ["grid", "rows", "columns", "spreadsheet"],
		section: "Plan",
		icon: Table2,
		run: (e, r) =>
			start(e, r).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
	},
	{
		id: "database",
		label: "Database",
		keywords: ["db", "records", "collection", "properties"],
		section: "Plan",
		icon: Database,
		feature: "database-blocks",
		run: (e, r) => {
			insertDatabase(e, r);
		},
	},
	{
		id: "chart",
		label: "Chart",
		keywords: ["graph", "bar", "line", "pie", "visualize"],
		section: "Visual",
		icon: ChartPie,
		feature: "charts",
		run: (editor, range) => {
			let databaseId = "";
			editor.state.doc.descendants((node) => {
				if (
					!databaseId &&
					node.type.name === "database" &&
					typeof node.attrs.id === "string"
				)
					databaseId = node.attrs.id;
			});
			start(editor, range)
				.insertContent({ type: "chart", attrs: { databaseId } })
				.run();
		},
	},
	{
		id: "columns-2",
		label: "2 columns",
		keywords: ["columns", "layout", "side by side", "two"],
		section: "Organise",
		icon: Columns2,
		run: (e, r) => void insertColumns(e, r, 2),
	},
	{
		id: "columns-3",
		label: "3 columns",
		keywords: ["columns", "layout", "side by side", "three"],
		section: "Organise",
		icon: Columns3,
		run: (e, r) => void insertColumns(e, r, 3),
	},
	{
		id: "date",
		label: "Date",
		keywords: ["today", "calendar", "day"],
		section: "Plan",
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
		section: "Organise",
		icon: Link2,
		hint: "[[",
		run: (e, r) => start(e, r).insertContent("[[").run(),
	},
	{
		id: "mention",
		label: "Mention a resource",
		keywords: ["contact", "person", "at", "resource"],
		section: "Organise",
		icon: AtSign,
		hint: "@",
		run: (e, r) => start(e, r).insertContent("@").run(),
	},
	{
		id: "image",
		label: "Image",
		keywords: ["picture", "photo", "screenshot", "attachment"],
		section: "Media",
		icon: Image,
		feature: "images",
		run: (e, r) => {
			start(e, r).run();
			void chooseImage(e);
		},
	},
	{
		id: "template",
		label: "Template",
		keywords: ["insert", "starter", "snippet", "boilerplate"],
		section: "Organise",
		icon: LayoutTemplate,
		feature: "templates",
		run: (e, r) => {
			start(e, r).run();
			e.view.dom.dispatchEvent(
				new CustomEvent(TEMPLATE_EVENT, { bubbles: true }),
			);
		},
	},
	{
		id: "toc",
		// In Plan after Table, so typing "tab" and Enter still makes a table.
		section: "Plan",
		icon: TableOfContents,
		label: "Table of contents",
		keywords: ["toc", "contents", "outline"],
		run: (e, r) => void insertTableOfContents(e, r),
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

/** Validate stored ids and keep the first (newest) occurrence of each. */
export function recentSlashIds(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	const ids: string[] = [];
	for (const id of value) {
		if (SLASH_ITEMS.some((item) => item.id === id) && !ids.includes(id)) {
			ids.push(id);
			if (ids.length === 5) break;
		}
	}
	return ids;
}

function fold(text: string): string {
	return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

function isSubsequence(query: string, text: string): boolean {
	let from = 0;
	for (const letter of query) {
		const index = text.indexOf(letter, from);
		if (index === -1) return false;
		from = index + letter.length;
	}
	return true;
}

export function filterSlashItems(
	query: string,
	where: {
		columns: boolean;
		templates?: boolean;
		links?: boolean;
		/** Whether a feature is on (asked when the menu opens). Absent means all are on. */
		enabled?: (featureId: string) => boolean;
	} = { columns: true },
	recent: readonly string[] = [],
): SlashItem[] {
	const q = fold(query.trim());
	const featureOn = (item: SlashItem) =>
		item.feature === undefined || where.enabled?.(item.feature) !== false;
	// Recent rows are taken from this list too, so a switched-off item is gone from both.
	const all = SLASH_ITEMS.filter(
		(item) =>
			(where.columns || !isColumns(item)) &&
			(where.templates !== false || !isTemplate(item)) &&
			(where.links !== false || !isLink(item)) &&
			featureOn(item),
	);
	if (query === "" && recent.length) {
		const rows = recentSlashIds(recent).flatMap((id) => {
			const item = all.find((entry) => entry.id === id);
			return item ? [{ ...item, section: "Recent" as const }] : [];
		});
		return [...rows, ...all];
	}
	if (!q) return all;
	// Best match first, so Enter picks what was typed: the label exactly, then the
	// label's start, then a word in the label, then a keyword. Ties keep the
	// menu's own order.
	const rank = (item: SlashItem): number => {
		const label = fold(item.label);
		if (label === q) return 0;
		if (label.startsWith(q)) return 1;
		if (label.split(" ").some((w) => w.startsWith(q))) return 2;
		const keywords = item.keywords.map(fold);
		if (
			keywords.some(
				(k) =>
					k.startsWith(q) || k.split(" ").some((word) => word.startsWith(q)),
			)
		)
			return 3;
		if ([label, ...keywords].some((text) => isSubsequence(q, text))) return 4;
		return -1;
	};
	return all
		.map((item, index) => ({ item, index, rank: rank(item) }))
		.filter((m) => m.rank >= 0)
		.sort((a, b) => a.rank - b.rank || a.index - b.index)
		.map((m) => m.item);
}
