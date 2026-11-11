/**
 * Daily check-ins (pure). Up to three quick check-ins a day (morning,
 * afternoon, evening), stored in the daily log note's properties. No new format
 * construct: the three scales (energy, mood, focus; 1 to 5) are `select`
 * properties with the options "1" to "5", and the short note is a `text`
 * property. A slot's properties are named `<Slot> <field>`, for example
 * `Morning energy` and `Evening note`.
 *
 * Every part is optional. An unchanged draft returns the very same note, an
 * empty value removes its property, and properties this module does not own
 * are never touched. Nothing here reads the clock: the time is a parameter.
 */
import type { JsonValue, Note } from "../note-format";
import {
	headerProps,
	optionsOf,
	type Props,
	withProps,
} from "../notes/properties";
import { validTime } from "./dates";
import { setEntry } from "./task-note";

export const CHECK_IN_SLOTS = ["morning", "afternoon", "evening"] as const;
export type CheckInSlot = (typeof CHECK_IN_SLOTS)[number];

export const SLOT_LABEL: Record<CheckInSlot, string> = {
	morning: "Morning",
	afternoon: "Afternoon",
	evening: "Evening",
};

export const SCALE_FIELDS = {
	energy: { label: "Energy", low: "Drained", high: "Charged" },
	mood: { label: "Mood", low: "Low", high: "Great" },
	focus: { label: "Focus", low: "Scattered", high: "Sharp" },
} as const;
export type ScaleField = keyof typeof SCALE_FIELDS;
export const SCALE_FIELD_KEYS = Object.keys(SCALE_FIELDS) as ScaleField[];

export const SCALE_MIN = 1;
export const SCALE_MAX = 5;
export const SCALE_OPTIONS = ["1", "2", "3", "4", "5"] as const;
export const MAX_NOTE_LENGTH = 200;

/** The property that holds one field of one slot. */
export const checkInProp = (slot: CheckInSlot, field: ScaleField | "note") =>
	`${SLOT_LABEL[slot]} ${field}`;

/* Settings: which slots are on, and when each starts */

export interface CheckInConfig {
	enabled: Record<CheckInSlot, boolean>;
	/** `HH:MM` when each slot begins. */
	starts: Record<CheckInSlot, string>;
}

export const DEFAULT_STARTS: Record<CheckInSlot, string> = {
	morning: "05:00",
	afternoon: "12:00",
	evening: "17:00",
};

export const DEFAULT_CHECK_IN_CONFIG: CheckInConfig = {
	enabled: { morning: true, afternoon: true, evening: true },
	starts: DEFAULT_STARTS,
};

export const minutesOf = (time: string): number =>
	Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

/**
 * The config with bad times replaced by defaults. Starts must rise
 * (morning < afternoon < evening); if they do not, all three fall back to the
 * defaults so the slots never overlap or vanish.
 */
export function resolveConfig(input: {
	enabled?: Partial<Record<CheckInSlot, boolean>>;
	starts?: Partial<Record<CheckInSlot, string>>;
}): CheckInConfig {
	const enabled = { ...DEFAULT_CHECK_IN_CONFIG.enabled };
	const starts = { ...DEFAULT_STARTS };
	for (const s of CHECK_IN_SLOTS) {
		const e = input.enabled?.[s];
		if (typeof e === "boolean") enabled[s] = e;
		const t = input.starts?.[s];
		if (validTime(t)) starts[s] = t;
	}
	const m = minutesOf(starts.morning);
	const a = minutesOf(starts.afternoon);
	const e = minutesOf(starts.evening);
	return {
		enabled,
		starts: m < a && a < e ? starts : { ...DEFAULT_STARTS },
	};
}

/**
 * The slot a time of day falls in. Before the morning start it is still the
 * evening slot (a late night belongs to the day before it).
 */
export function slotAt(config: CheckInConfig, now: Date): CheckInSlot {
	const mins = now.getHours() * 60 + now.getMinutes();
	if (mins >= minutesOf(config.starts.evening)) return "evening";
	if (mins >= minutesOf(config.starts.afternoon)) return "afternoon";
	if (mins >= minutesOf(config.starts.morning)) return "morning";
	return "evening";
}

/** The enabled slots, in day order. */
export const enabledSlots = (config: CheckInConfig): CheckInSlot[] =>
	CHECK_IN_SLOTS.filter((s) => config.enabled[s]);

/**
 * The slot to show prominently: the current one when it is enabled and the
 * day shown is today. Otherwise none (a past or future day shows all compact).
 */
export function prominentSlot(
	config: CheckInConfig,
	now: Date,
	isToday: boolean,
): CheckInSlot | null {
	if (!isToday) return null;
	const slot = slotAt(config, now);
	return config.enabled[slot] ? slot : null;
}

/* Drafts */

export interface CheckInDraft {
	scales: Partial<Record<ScaleField, number>>;
	note: string;
}

export const emptyCheckIn = (): CheckInDraft => ({ scales: {}, note: "" });

export const setScale = (
	d: CheckInDraft,
	field: ScaleField,
	value: number | null,
): CheckInDraft => {
	const { [field]: _gone, ...scales } = d.scales;
	return value === null
		? { ...d, scales }
		: { ...d, scales: { ...scales, [field]: value } };
};

const validScale = (n: unknown): n is number =>
	typeof n === "number" &&
	Number.isInteger(n) &&
	n >= SCALE_MIN &&
	n <= SCALE_MAX;

/** What would be stored: valid scales only, the note trimmed. */
export function normalize(d: CheckInDraft): CheckInDraft {
	const scales: CheckInDraft["scales"] = {};
	for (const f of SCALE_FIELD_KEYS) {
		const v = d.scales[f];
		if (validScale(v)) scales[f] = v;
	}
	return { scales, note: d.note.trim() };
}

export const isEmptyCheckIn = (d: CheckInDraft): boolean => {
	const n = normalize(d);
	return Object.keys(n.scales).length === 0 && n.note === "";
};

const same = (a: CheckInDraft, b: CheckInDraft) =>
	a.note === b.note &&
	SCALE_FIELD_KEYS.every((f) => a.scales[f] === b.scales[f]);

/** True when saving `d` over `stored` would change nothing. */
export const unchanged = (d: CheckInDraft, stored: CheckInDraft) =>
	same(normalize(d), normalize(stored));

export function checkInProblem(d: CheckInDraft): string | undefined {
	return d.note.length > MAX_NOTE_LENGTH
		? `The note is too long (${MAX_NOTE_LENGTH} characters at most).`
		: undefined;
}

/** One line for a collapsed slot, for example `Energy 3 · Mood 4`. */
export function checkInPreview(d: CheckInDraft): string {
	const n = normalize(d);
	const parts: string[] = SCALE_FIELD_KEYS.filter((f) => n.scales[f]).map(
		(f) => `${SCALE_FIELDS[f].label} ${n.scales[f]}`,
	);
	if (n.note) parts.push("note");
	return parts.length ? parts.join(" · ") : "";
}

/* Reading and writing a note */

type Obj = { [k: string]: JsonValue };
const isObj = (v: unknown): v is Obj =>
	typeof v === "object" && v !== null && !Array.isArray(v);

const entryOf = (props: Props, name: string): JsonValue | undefined => {
	const key = Object.keys(props).find(
		(k) => k.toLowerCase() === name.toLowerCase(),
	);
	return key === undefined ? undefined : props[key];
};

/** The stored check-in of a slot (empty when it has none). */
export function readCheckIn(note: Note, slot: CheckInSlot): CheckInDraft {
	const props = headerProps(note.header) ?? {};
	const scales: CheckInDraft["scales"] = {};
	for (const f of SCALE_FIELD_KEYS) {
		const e = entryOf(props, checkInProp(slot, f));
		if (!isObj(e)) continue;
		const n = typeof e.value === "string" ? Number(e.value) : e.value;
		if (validScale(n)) scales[f] = n;
	}
	const e = entryOf(props, checkInProp(slot, "note"));
	const text = isObj(e) && typeof e.value === "string" ? e.value.trim() : "";
	return { scales, note: text };
}

function writeScale(
	props: Props,
	name: string,
	value: number | undefined,
): Props {
	if (value === undefined) return setEntry(props, name, "select", null);
	const e = entryOf(props, name);
	// An existing select keeps the user's own options, plus the value if missing.
	const own = isObj(e) && e.type === "select" ? optionsOf(e) : null;
	const list = [...(own ?? SCALE_OPTIONS)];
	if (!list.includes(String(value))) list.push(String(value));
	const next = setEntry(props, name, "select", String(value));
	const k = Object.keys(next).find(
		(n) => n.toLowerCase() === name.toLowerCase(),
	) as string;
	return { ...next, [k]: { ...(next[k] as Obj), options: list } };
}

/**
 * The note with the slot's draft stored. Returns `note` itself when nothing
 * would change, or when the properties are not an object (nothing is edited).
 */
export function applyCheckIn(
	note: Note,
	slot: CheckInSlot,
	draft: CheckInDraft,
): Note {
	let props = headerProps(note.header);
	if (!props) return note;
	const next = normalize(draft);
	if (same(next, readCheckIn(note, slot))) return note;
	for (const f of SCALE_FIELD_KEYS)
		props = writeScale(props, checkInProp(slot, f), next.scales[f]);
	props = setEntry(props, checkInProp(slot, "note"), "text", next.note || null);
	return { ...note, header: withProps(note.header, props) };
}
