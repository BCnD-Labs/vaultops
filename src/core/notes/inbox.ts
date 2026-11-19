import type { Block, JsonValue, Note } from "../note-format";
import {
	addProperty,
	findName,
	fits,
	headerProps,
	type Props,
	removeProperty,
	setValue,
	withProps,
} from "./properties";

/**
 * Inbox sections ("brain dump"): a heading marks a part of a note that should
 * end up empty. A note whose inbox still has content is "to process"; once it
 * is empty the note gets a `Processed` date property. No format change beyond
 * two new conventions (both listed for the maintainer): `attrs.role = "inbox"`
 * on a heading, and the `Processed` date property.
 *
 * A note is a flat list of blocks in reading order, nesting is `parent`. The
 * section is the heading's following siblings (same `parent`) up to the next
 * heading of the same or a higher level; their children belong to it too.
 */

export const INBOX_ROLE = "inbox";
export const PROCESSED = "Processed";

/** Heading texts that count as an inbox when no `role` is set (case-insensitive). */
const INBOX_TITLES = new Set(["brain dump", "braindump", "inbox"]);

export interface InboxSection {
	heading: Block;
	level: number;
	/** The section's top-level blocks in order, blank ones included. */
	blocks: Block[];
}

function isObject(value: unknown): value is { [k: string]: JsonValue } {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function attrOf(block: Block, name: string): JsonValue | undefined {
	return isObject(block.attrs) ? block.attrs[name] : undefined;
}

function levelOf(block: Block): number {
	const level = attrOf(block, "level");
	return typeof level === "number" ? level : 1;
}

/** Plain text of inline content, and whether it holds anything but whitespace. */
function inlineInfo(content: JsonValue | undefined): {
	text: string;
	blank: boolean;
} {
	let text = "";
	let blank = true;
	// Own stack, not recursion: a hostile file can nest inline content deeply.
	const stack: JsonValue[] = [content ?? null];
	while (stack.length > 0) {
		const item = stack.pop();
		if (Array.isArray(item)) {
			for (let i = item.length - 1; i >= 0; i--)
				stack.push(item[i] as JsonValue);
		} else if (isObject(item)) {
			if (item.type === "text") {
				const t = typeof item.text === "string" ? item.text : "";
				text += t;
				if (t.trim() !== "") blank = false;
			} else if (item.type === "noteLink") {
				const label = isObject(item.attrs) ? item.attrs.label : "";
				text += typeof label === "string" ? label : "";
				blank = false;
			} else if (item.type !== "hardBreak") {
				// A date chip or any other inline node is content.
				blank = false;
				if (item.content !== undefined) stack.push(item.content);
			}
		}
	}
	return { text, blank };
}

/** The heading's text with spaces collapsed. */
function headingText(block: Block): string {
	return inlineInfo(block.content).text.trim().replace(/\s+/g, " ");
}

/** Whether a heading block is an inbox: its role says so, else its text does. */
export function isInboxHeading(block: Block): boolean {
	if (block.type !== "heading") return false;
	const role = attrOf(block, "role");
	// An explicit role wins: a heading with another role is something else.
	if (typeof role === "string") return role === INBOX_ROLE;
	return INBOX_TITLES.has(headingText(block).toLowerCase());
}

export function childrenByParent(blocks: Block[]): Map<string, Block[]> {
	const map = new Map<string, Block[]>();
	for (const block of blocks) {
		if (block.parent === null) continue;
		const list = map.get(block.parent) ?? [];
		list.push(block);
		map.set(block.parent, list);
	}
	return map;
}

/**
 * A block that adds nothing: an empty paragraph, or a list, list item holding
 * only such blocks (the editor leaves a lone empty bullet behind). Everything
 * else, a divider and a heading included, is content.
 */
function isBlank(block: Block, kids: Map<string, Block[]>): boolean {
	const stack: Block[] = [block];
	while (stack.length > 0) {
		const current = stack.pop() as Block;
		if (current.type === "paragraph") {
			// A paragraph is blank only when it has no text and no children.
			if (!inlineInfo(current.content).blank) return false;
			if (kids.has(current.id ?? "")) return false;
		} else if (
			current.type === "bulletList" ||
			current.type === "orderedList" ||
			current.type === "listItem"
		) {
			for (const child of kids.get(current.id ?? "") ?? []) stack.push(child);
		} else {
			return false;
		}
	}
	return true;
}

/** Every inbox section in a note, in order. Canvases have none. */
export function findInboxSections(note: Note): InboxSection[] {
	if (note.header.kind === "canvas") return [];
	const sections: InboxSection[] = [];
	note.blocks.forEach((heading, start) => {
		if (!isInboxHeading(heading)) return;
		const level = levelOf(heading);
		const blocks: Block[] = [];
		for (const block of note.blocks.slice(start + 1)) {
			if (block.parent !== heading.parent) continue;
			if (block.type === "heading" && levelOf(block) <= level) break;
			blocks.push(block);
		}
		sections.push({ heading, level, blocks });
	});
	return sections;
}

/**
 * The top-level content blocks of all of a note's inboxes, in order, without
 * blank paragraphs (their children stay with them, as in the file).
 */
export function inboxBlocks(note: Note): Block[] {
	const kids = childrenByParent(note.blocks);
	const seen = new Set<Block>();
	const out: Block[] = [];
	for (const section of findInboxSections(note)) {
		for (const block of section.blocks) {
			if (seen.has(block) || isBlank(block, kids)) continue;
			seen.add(block);
			out.push(block);
		}
	}
	return out;
}

/** Keep a section item and its subtree together under the next ordinary heading. */
export function moveOutOfInbox(note: Note, blockId: string): Note {
	const byId = new Map(note.blocks.map((b) => [b.id, b]));
	const ancestors = new Set<string>();
	let id: string | null = blockId;
	while (id && !ancestors.has(id)) {
		ancestors.add(id);
		id = byId.get(id)?.parent ?? null;
	}
	const section = findInboxSections(note).find((s) =>
		s.blocks.some((b) => b.id && ancestors.has(b.id)),
	);
	if (!section) return note;
	const moving = new Set([blockId]);
	for (const b of note.blocks) {
		if (b.parent && moving.has(b.parent) && b.id) moving.add(b.id);
	}
	const kept = note.blocks.filter((b) => !moving.has(b.id ?? ""));
	const moved = note.blocks.filter((b) => moving.has(b.id ?? ""));
	const parent = section.heading.parent;
	const siblings = kept.filter((b) => b.parent === parent);
	const following = siblings.slice(siblings.indexOf(section.heading) + 1);
	const boundary = following.find(
		(b) => b.type === "heading" && levelOf(b) <= section.level,
	);
	let at: number;
	if (boundary && !isInboxHeading(boundary)) {
		at = kept.indexOf(boundary) + 1;
	} else {
		// An inbox extending to the end needs an explicit heading to close it.
		const last = siblings.at(-1) ?? section.heading;
		at = boundary ? kept.indexOf(boundary) : kept.indexOf(last) + 1;
		if (!boundary) {
			const descendants = new Set([last.id]);
			while (
				at < kept.length &&
				kept[at]?.parent &&
				descendants.has(kept[at]?.parent ?? "")
			) {
				descendants.add(kept[at]?.id);
				at++;
			}
		}
		kept.splice(at++, 0, {
			id: crypto.randomUUID(),
			type: "heading",
			parent,
			attrs: { level: section.level },
			content: [{ type: "text", text: "Processed" }],
		});
	}
	kept.splice(
		at,
		0,
		...moved.map((b) => (b.id === blockId ? { ...b, parent } : b)),
	);
	return { ...note, blocks: kept };
}

/** True when the note has no inbox content (also when it has no inbox at all). */
export function isInboxEmpty(note: Note): boolean {
	return inboxBlocks(note).length === 0;
}

/** The note's `Processed` date, or null when it has none (or not a date). */
export function processedDay(note: Note): string | null {
	const props = headerProps(note.header);
	const key = props ? findName(props, PROCESSED) : null;
	const entry = key && props ? props[key] : null;
	return isObject(entry) &&
		entry.type === "date" &&
		typeof entry.value === "string"
		? entry.value
		: null;
}

/** A `Processed` entry of another type is the user's own and is never touched. */
function ownProcessed(props: Props): { key: string | null; own: boolean } {
	const key = findName(props, PROCESSED);
	if (key === null) return { key, own: true };
	const entry = props[key];
	return { key, own: isObject(entry) && entry.type === "date" };
}

function checkedDay(day: string): void {
	if (!fits("date", day) || day === null) {
		throw new Error(`"${day}" is not a date (YYYY-MM-DD).`);
	}
}

/** Set `Processed` to `day`. A note this can't be written to is returned as is. */
export function markProcessed(note: Note, day: string): Note {
	checkedDay(day);
	const props = headerProps(note.header);
	if (props === null) return note;
	const { key, own } = ownProcessed(props);
	if (!own) return note;
	let next: Props = props;
	if (key === null) {
		const added = addProperty(props, PROCESSED, "date");
		if (!added.ok) return note;
		next = added.props;
	}
	const set = setValue(next, key ?? PROCESSED, day);
	if (!set.ok) return note;
	return { ...note, header: withProps(note.header, set.props) };
}

/** Remove `Processed`. A note without it is returned as is. */
export function clearProcessed(note: Note): Note {
	const props = headerProps(note.header);
	if (props === null) return note;
	const { key, own } = ownProcessed(props);
	if (key === null || !own) return note;
	return {
		...note,
		header: withProps(note.header, removeProperty(props, key)),
	};
}

/**
 * The one rule: a note with an inbox section that is empty gets `Processed:
 * day` (an existing date stays); one whose inbox has content loses it; a note
 * with no inbox section is left alone.
 */
export function reconcileProcessed(note: Note, day: string): Note {
	if (findInboxSections(note).length === 0) return note;
	if (!isInboxEmpty(note)) return clearProcessed(note);
	return processedDay(note) === null ? markProcessed(note, day) : note;
}

export interface ToProcess<T> {
	item: T;
	title: string;
	/** The note's `Date` property (YYYY-MM-DD), or null. */
	date: string | null;
	/** What is left in its inbox. */
	blocks: Block[];
}

function dateProperty(note: Note): string | null {
	const props = headerProps(note.header);
	const key = props ? findName(props, "Date") : null;
	const entry = key && props ? props[key] : null;
	return isObject(entry) &&
		entry.type === "date" &&
		typeof entry.value === "string"
		? entry.value
		: null;
}

function titleOf(path: string, note: Note): string {
	const title = note.header.title;
	if (typeof title === "string" && title.trim() !== "") return title;
	return (path.split("/").pop() ?? path).replace(/\.vnote$/, "");
}

/**
 * Notes whose inbox has content, oldest first.
 *
 * Neither a vault row nor a scanned note carries a
 * created or edited time, so "oldest" is the note's `Date` property (a journal
 * day, say), notes without one last, then title, then path. The edited time
 * would be better once the host reports it.
 */
export function notesToProcess<T extends { path: string; note: Note }>(
	items: readonly T[],
): ToProcess<T>[] {
	const out: ToProcess<T>[] = [];
	for (const item of items) {
		const blocks = inboxBlocks(item.note);
		if (blocks.length === 0) continue;
		out.push({
			item,
			title: titleOf(item.path, item.note),
			date: dateProperty(item.note),
			blocks,
		});
	}
	return out.sort((a, b) => {
		if (a.date !== b.date) {
			if (a.date === null) return 1;
			if (b.date === null) return -1;
			return a.date < b.date ? -1 : 1;
		}
		return (
			a.title.toLowerCase().localeCompare(b.title.toLowerCase()) ||
			a.item.path.localeCompare(b.item.path)
		);
	});
}
