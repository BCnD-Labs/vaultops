/**
 * Daily logs. One note per day at `Journal/YYYY-MM-DD.vnote`. The body is the
 * day's entries; an entry is a paragraph. Optional named sections (up to
 * three) are heading blocks, and an entry belongs to the section above it.
 * Entries before the first heading are the day's main log.
 */
import { NOTE_EXT } from "../file-name/file-name";
import type { Block, JsonValue, Note } from "../note-format";
import { NOTE_FORMAT, NOTE_FORMAT_VERSION } from "../note-format";
import { withProps } from "../notes/properties";
import { validDateKey } from "./dates";
import { JOURNAL_FOLDER } from "./task-note";

export const MAX_SECTIONS = 3;
export const LOG_PROMPTS = [
	"Shipped",
	"Learned",
	"Blocked on",
	"Tomorrow",
] as const;

export const logPath = (day: string): string =>
	`${JOURNAL_FOLDER}/${day}${NOTE_EXT}`;

/** The day a journal path is for, or null. */
export function dayOfLogPath(path: string): string | null {
	const m = new RegExp(
		`^${JOURNAL_FOLDER}/(\\d{4}-\\d{2}-\\d{2})${NOTE_EXT.replace(".", "\\.")}$`,
	).exec(path);
	return m && validDateKey(m[1]) ? (m[1] as string) : null;
}

export function newLogNote(day: string): Partial<Note> {
	return {
		header: withProps(
			{ format: NOTE_FORMAT, v: NOTE_FORMAT_VERSION, noteId: "" },
			{ Date: { type: "date", value: day } },
		),
		blocks: [],
	};
}

const plain = (value: JsonValue | undefined): string => {
	if (Array.isArray(value)) return value.map(plain).join("");
	if (!value || typeof value !== "object") return "";
	if (value.type === "text" && typeof value.text === "string")
		return value.text;
	return plain(value.content);
};

export interface LogEntry {
	id: string;
	text: string;
}
export interface LogSection {
	/** null for the day's main log. */
	id: string | null;
	name: string;
	entries: LogEntry[];
}

/** The day's main log followed by its named sections, in file order. */
export function readLog(note: Note): LogSection[] {
	const out: LogSection[] = [{ id: null, name: "Log", entries: [] }];
	for (const block of note.blocks) {
		if (block.parent !== null) continue;
		const text = plain(block["content"]);
		if (block.type === "heading") {
			out.push({ id: block.id ?? "", name: text || "Section", entries: [] });
		} else if (block.type === "paragraph" && text.trim() !== "") {
			(out[out.length - 1] as LogSection).entries.push({
				id: block.id ?? "",
				text,
			});
		}
	}
	return out;
}

const paragraph = (text: string): Block => ({
	id: crypto.randomUUID(),
	type: "paragraph",
	parent: null,
	content: [{ type: "text", text }],
});

/** Append one entry to a section (null = main log). Existing blocks are untouched. */
export function addEntry(
	note: Note,
	sectionId: string | null,
	text: string,
): Note {
	const trimmed = text.trim();
	if (trimmed === "") return note;
	const blocks = [...note.blocks];
	const entry = paragraph(trimmed);
	if (sectionId === null) {
		const firstHeading = blocks.findIndex(
			(b) => b.parent === null && b.type === "heading",
		);
		blocks.splice(firstHeading < 0 ? blocks.length : firstHeading, 0, entry);
	} else {
		const at = blocks.findIndex((b) => b.id === sectionId);
		if (at < 0) return note;
		let end = at + 1;
		while (
			end < blocks.length &&
			!(blocks[end]?.parent === null && blocks[end]?.type === "heading")
		)
			end++;
		blocks.splice(end, 0, entry);
	}
	return { ...note, blocks };
}

/** Add a named section at the end. Null when there are already three or the name is empty. */
export function addSection(note: Note, name: string): Note | null {
	const clean = name.trim();
	if (clean === "") return null;
	const count = note.blocks.filter(
		(b) => b.parent === null && b.type === "heading",
	).length;
	if (count >= MAX_SECTIONS) return null;
	return {
		...note,
		blocks: [
			...note.blocks,
			{
				id: crypto.randomUUID(),
				type: "heading",
				parent: null,
				attrs: { level: 3 },
				content: [{ type: "text", text: clean }],
			},
		],
	};
}

/** Does the log have anything written? */
export const hasEntries = (note: Note) =>
	readLog(note).some((s) => s.entries.length > 0);
