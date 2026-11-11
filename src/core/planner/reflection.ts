/**
 * Task reflection (pure). Every part is optional; a user adds only what they
 * want. The choice items (Difficulty, Time spent, Help, Outcome) are `select`
 * properties with their option lists; reading also accepts the older `text`
 * form, which is upgraded the next time the reflection is saved. Blocker and
 * Next time are `text` properties, `Reflected` is an ISO timestamp, and free notes are
 * paragraphs under a top-level `Reflection` heading (level 2) in the body.
 *
 * An unchanged draft returns the very same note, so `Reflected` only moves
 * when something really changed. Properties and blocks this module does not
 * own are never touched.
 */
import type { Block, JsonValue, Note } from "../note-format";
import {
	headerProps,
	optionsOf,
	type Props,
	withProps,
} from "../notes/properties";
import { setEntry } from "./task-note";

export const REFLECTION_HEADING = "Reflection";
export const REFLECTED_PROP = "Reflected";

export const REFLECTION_ITEMS = {
	difficulty: {
		label: "Difficulty",
		prop: "Difficulty",
		options: ["Easy", "Moderate", "Hard"],
	},
	timeSpent: {
		label: "Time spent",
		prop: "Time spent",
		options: [
			"5 min",
			"10 min",
			"15 min",
			"30 min",
			"45 min",
			"1 h",
			"1.5 h",
			"2 h+",
		],
	},
	help: {
		label: "Help",
		prop: "Help",
		options: ["None", "Reference", "Another person", "AI assistance"],
	},
	outcome: {
		label: "Outcome",
		prop: "Outcome",
		options: ["As expected", "Better than expected", "Needs follow-up"],
	},
	blocker: { label: "Blocker", prop: "Blocker", options: [] },
	nextTime: { label: "Next time", prop: "Next time", options: [] },
} as const;

export type ReflectionKey = keyof typeof REFLECTION_ITEMS;
export const REFLECTION_KEYS = Object.keys(REFLECTION_ITEMS) as ReflectionKey[];

export interface ReflectionDraft {
	/** Items the user added. An empty value is an added but unfilled item. */
	items: Partial<Record<ReflectionKey, string>>;
	/** Free notes; one paragraph per line. */
	notes: string;
}

export const emptyReflection = (): ReflectionDraft => ({
	items: {},
	notes: "",
});

export const isChoice = (key: ReflectionKey): boolean =>
	REFLECTION_ITEMS[key].options.length > 0;

export const MAX_ITEM_LENGTH = 1000;
export const MAX_NOTES_LENGTH = 20000;

export function addItem(
	d: ReflectionDraft,
	key: ReflectionKey,
): ReflectionDraft {
	return key in d.items ? d : { ...d, items: { ...d.items, [key]: "" } };
}
export function setItem(
	d: ReflectionDraft,
	key: ReflectionKey,
	value: string,
): ReflectionDraft {
	return { ...d, items: { ...d.items, [key]: value } };
}
export function removeItem(
	d: ReflectionDraft,
	key: ReflectionKey,
): ReflectionDraft {
	const { [key]: _gone, ...items } = d.items;
	return { ...d, items };
}

const normNotes = (s: string) =>
	s
		.split("\n")
		.map((l) => l.trimEnd())
		.filter((l) => l.trim() !== "")
		.join("\n");

/** What would be stored: filled items only, trimmed; notes as clean lines. */
export function normalize(d: ReflectionDraft): ReflectionDraft {
	const items: ReflectionDraft["items"] = {};
	for (const key of REFLECTION_KEYS) {
		const v = d.items[key]?.trim();
		if (v) items[key] = v;
	}
	return { items, notes: normNotes(d.notes) };
}

export const isEmptyReflection = (d: ReflectionDraft): boolean => {
	const n = normalize(d);
	return Object.keys(n.items).length === 0 && n.notes === "";
};

const sameDraft = (a: ReflectionDraft, b: ReflectionDraft) =>
	a.notes === b.notes &&
	REFLECTION_KEYS.every((k) => (a.items[k] ?? "") === (b.items[k] ?? ""));

/** True when saving `d` over `stored` would change nothing. */
export const unchanged = (d: ReflectionDraft, stored: ReflectionDraft) =>
	sameDraft(normalize(d), normalize(stored));

/** A reason the draft cannot be saved, or undefined. */
export function reflectionProblem(d: ReflectionDraft): string | undefined {
	if (d.notes.length > MAX_NOTES_LENGTH) return "The notes are too long.";
	if (Object.values(d.items).some((v) => v.length > MAX_ITEM_LENGTH))
		return "One of the items is too long.";
	return undefined;
}

/** One line for a collapsed reflection. */
export function reflectionPreview(d: ReflectionDraft): string {
	const n = normalize(d);
	const parts = REFLECTION_KEYS.filter((k) => isChoice(k) && n.items[k]).map(
		(k) => n.items[k] as string,
	);
	const other = Object.keys(n.items).length - parts.length + (n.notes ? 1 : 0);
	if (other > 0) parts.push(`${other} note${other === 1 ? "" : "s"}`);
	return parts.length ? parts.join(" · ") : "Empty reflection";
}

/* Reading and writing a note */

type Obj = { [k: string]: JsonValue };
const isObj = (v: unknown): v is Obj =>
	typeof v === "object" && v !== null && !Array.isArray(v);

const plain = (value: JsonValue | undefined): string => {
	if (Array.isArray(value)) return value.map(plain).join("");
	if (!isObj(value)) return "";
	if (value.type === "text" && typeof value.text === "string")
		return value.text;
	return plain(value.content);
};

function textProp(props: Obj, name: string): string | undefined {
	const key = Object.keys(props).find(
		(k) => k.toLowerCase() === name.toLowerCase(),
	);
	const e = key === undefined ? undefined : props[key];
	// A property of another type (for example a select made by hand) that holds a
	// string is read too, and keeps its type when written back.
	return isObj(e) && typeof e.value === "string" ? e.value : undefined;
}

/**
 * Write one reflection item. A choice becomes a `select` with its options (an
 * existing select keeps the user's own options, plus the value if missing); a
 * text item keeps whatever type it had.
 */
function writeItem(
	props: Props,
	key: ReflectionKey,
	value: string | undefined,
): Props {
	const { prop, options } = REFLECTION_ITEMS[key];
	const found = Object.keys(props).find(
		(k) => k.toLowerCase() === prop.toLowerCase(),
	);
	const e = found === undefined ? undefined : props[found];
	if (options.length === 0) {
		const type = isObj(e) && typeof e.type === "string" ? e.type : "text";
		return setEntry(props, prop, type, value ?? null);
	}
	if (value === undefined) return setEntry(props, prop, "select", null);
	const own = isObj(e) && e.type === "select" ? optionsOf(e) : null;
	const list = [...(own ?? options)];
	if (!list.includes(value)) list.push(value);
	const next = setEntry(props, prop, "select", value);
	const k = Object.keys(next).find(
		(n) => n.toLowerCase() === prop.toLowerCase(),
	) as string;
	return { ...next, [k]: { ...(next[k] as Obj), options: list } };
}

const isTop = (b: Block, type: string) => b.parent === null && b.type === type;
const isHeading = (b: Block) => isTop(b, "heading");
const isReflectionHeading = (b: Block) =>
	isHeading(b) &&
	plain(b.content).trim().toLowerCase() === REFLECTION_HEADING.toLowerCase() &&
	(isObj(b.attrs) ? b.attrs.level : undefined) === 2;

/** Index range [from, to) of the blocks after the heading, up to the next top-level heading. */
function sectionRange(blocks: Block[]): { at: number; end: number } | null {
	const at = blocks.findIndex(isReflectionHeading);
	if (at < 0) return null;
	let end = at + 1;
	while (end < blocks.length && !isHeading(blocks[end] as Block)) end++;
	return { at, end };
}

function notesOf(blocks: Block[]): string {
	const r = sectionRange(blocks);
	if (!r) return "";
	return normNotes(
		blocks
			.slice(r.at + 1, r.end)
			.filter((b) => isTop(b, "paragraph"))
			.map((b) => plain(b.content))
			.join("\n"),
	);
}

/** The stored reflection of a task note (empty when it has none). */
export function readReflection(note: Note): ReflectionDraft {
	const props = headerProps(note.header) ?? {};
	const items: ReflectionDraft["items"] = {};
	for (const key of REFLECTION_KEYS) {
		const v = textProp(props, REFLECTION_ITEMS[key].prop)?.trim();
		if (v) items[key] = v;
	}
	return { items, notes: notesOf(note.blocks) };
}

const paragraph = (text: string): Block => ({
	id: crypto.randomUUID(),
	type: "paragraph",
	parent: null,
	content: [{ type: "text", text }],
});

function writeNotes(blocks: Block[], notes: string): Block[] {
	const lines = notes === "" ? [] : notes.split("\n");
	const r = sectionRange(blocks);
	if (!r) {
		if (lines.length === 0) return blocks;
		return [
			...blocks,
			{
				id: crypto.randomUUID(),
				type: "heading",
				parent: null,
				attrs: { level: 2 },
				content: [{ type: "text", text: REFLECTION_HEADING }],
			},
			...lines.map(paragraph),
		];
	}
	const body = blocks.slice(r.at + 1, r.end);
	const firstPara = body.findIndex((b) => isTop(b, "paragraph"));
	const next = lines.map(paragraph);
	// Other blocks the user put in the section stay where they were.
	const merged =
		firstPara < 0
			? [...next, ...body]
			: [
					...body.slice(0, firstPara),
					...next,
					...body.slice(firstPara).filter((b) => !isTop(b, "paragraph")),
				];
	if (merged.length === 0)
		return [...blocks.slice(0, r.at), ...blocks.slice(r.end)];
	return [...blocks.slice(0, r.at + 1), ...merged, ...blocks.slice(r.end)];
}

/**
 * The note with the draft stored. Returns `note` itself when nothing would
 * change (so the timestamp stays put), or when the properties are not an
 * object (nothing is edited).
 */
export function applyReflection(
	note: Note,
	draft: ReflectionDraft,
	now: Date,
): Note {
	let props = headerProps(note.header);
	if (!props) return note;
	const next = normalize(draft);
	if (sameDraft(next, readReflection(note))) return note;
	for (const key of REFLECTION_KEYS) {
		const v = next.items[key];
		props = writeItem(props, key, v);
	}
	const empty = Object.keys(next.items).length === 0 && next.notes === "";
	props = setEntry(
		props,
		REFLECTED_PROP,
		"text",
		empty ? null : now.toISOString(),
	);
	return {
		...note,
		header: withProps(note.header, props),
		blocks: writeNotes(note.blocks, next.notes),
	};
}
