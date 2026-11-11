/**
 * A planner task is an ordinary note in the `Planner` folder. Its fields are
 * note properties (ADR-0002, no format change), so the editor, the properties
 * panel, search, tags and version control all work on it as they do on any
 * note. The note body is the task's description, like a GitHub issue's.
 *
 * Properties: Kind (task | event), Status (open | closed), Number, Due, Due time,
 * Scheduled, Start, Duration, Starred, Created, Closed, Reflected (see reflection.ts); labels are the note's `tags`.
 */
import type { Block, JsonValue, Note } from "../note-format";
import { NOTE_FORMAT, NOTE_FORMAT_VERSION } from "../note-format";
import { headerProps, type Props, withProps } from "../notes/properties";
import { tagsOf } from "../notes/tags";
import { validDateKey, validTime } from "./dates";
import type { PlannerTask } from "./rules";

export const PLANNER_FOLDER = "Planner";
export const JOURNAL_FOLDER = "Journal";

type Obj = { [k: string]: JsonValue };
const isObj = (v: unknown): v is Obj =>
	typeof v === "object" && v !== null && !Array.isArray(v);

function propValue(
	props: Props,
	name: string,
	type: string,
): JsonValue | undefined {
	const key = Object.keys(props).find(
		(k) => k.toLowerCase() === name.toLowerCase(),
	);
	const entry = key === undefined ? undefined : props[key];
	if (!isObj(entry) || entry.type !== type) return undefined;
	return entry.value;
}

const text = (p: Props, n: string) => {
	const v = propValue(p, n, "text");
	return typeof v === "string" && v !== "" ? v : undefined;
};

/** The task a note describes, or null when the note is not a planner task. */
export function taskFromNote(
	path: string,
	note: Note,
	preview = "",
): PlannerTask | null {
	const props = headerProps(note.header);
	if (!props) return null;
	const kind = text(props, "Kind");
	if (kind !== "task" && kind !== "event") return null;
	const num = propValue(props, "Number", "number");
	const due = propValue(props, "Due", "date");
	const sched = propValue(props, "Scheduled", "date");
	const duration = propValue(props, "Duration", "number");
	const dueTime = text(props, "Due time");
	const start = text(props, "Start");
	const prio = text(props, "Priority");
	const rec = text(props, "Recurrence");
	return {
		path,
		number: typeof num === "number" && num > 0 ? Math.floor(num) : 0,
		title: typeof note.header.title === "string" ? note.header.title : path,
		status: text(props, "Status") === "closed" ? "closed" : "open",
		kind,
		priority:
			prio === "low" || prio === "medium" || prio === "high" ? prio : undefined,
		recurrence: rec,
		due: typeof due === "string" && validDateKey(due) ? due : undefined,
		dueTime: validTime(dueTime) ? dueTime : undefined,
		scheduledDate:
			typeof sched === "string" && validDateKey(sched) ? sched : undefined,
		scheduledTime: validTime(start) ? start : undefined,
		durationMinutes:
			typeof duration === "number" && duration >= 5 && duration <= 1440
				? Math.round(duration)
				: undefined,
		starred: propValue(props, "Starred", "checkbox") === true,
		labels: tagsOf(props),
		createdAt: text(props, "Created"),
		closedAt: text(props, "Closed"),
		reflectedAt: text(props, "Reflected"),
		preview,
	};
}

/** What a task note is built from. Empty fields are left out of the file. */
export interface NewTask {
	title: string;
	kind?: "task" | "event";
	number: number;
	priority?: "low" | "medium" | "high";
	recurrence?: string;
	due?: string;
	dueTime?: string;
	scheduledDate?: string;
	scheduledTime?: string;
	durationMinutes?: number;
	starred?: boolean;
	labels?: string[];
	now: Date;
}

const entry = (type: string, value: JsonValue): JsonValue => ({ type, value });

export function taskProps(t: NewTask): Props {
	const props: Props = {
		Kind: entry("text", t.kind ?? "task"),
		Status: entry("text", "open"),
		Number: entry("number", t.number),
	};
	if (t.priority) props.Priority = entry("text", t.priority);
	if (t.recurrence) props.Recurrence = entry("text", t.recurrence);
	if (t.due) props.Due = entry("date", t.due);
	if (t.dueTime) props["Due time"] = entry("text", t.dueTime);
	if (t.scheduledDate) props.Scheduled = entry("date", t.scheduledDate);
	if (t.scheduledTime) props.Start = entry("text", t.scheduledTime);
	if (t.durationMinutes) props.Duration = entry("number", t.durationMinutes);
	if (t.starred) props.Starred = entry("checkbox", true);
	if (t.labels?.length) props.tags = entry("list", t.labels);
	props.Created = entry("text", t.now.toISOString());
	return props;
}

/** The `initial` for `createNote` of a new task. */
export function newTaskNote(t: NewTask): Partial<Note> {
	const blocks: Block[] = [
		{ id: crypto.randomUUID(), type: "paragraph", parent: null },
	];
	return {
		header: withProps(
			{ format: NOTE_FORMAT, v: NOTE_FORMAT_VERSION, noteId: "" },
			taskProps(t),
		),
		blocks,
	};
}

/** The next issue number: one past the highest in use (closed tasks count). */
export function nextNumber(
	tasks: readonly Pick<PlannerTask, "number">[],
): number {
	return tasks.reduce((n, t) => Math.max(n, t.number), 0) + 1;
}

export interface TaskPatch {
	title?: string;
	status?: "open" | "closed";
	priority?: "low" | "medium" | "high" | null;
	recurrence?: string | null;
	due?: string | null;
	dueTime?: string | null;
	scheduledDate?: string | null;
	scheduledTime?: string | null;
	durationMinutes?: number | null;
	starred?: boolean;
	number?: number;
	now?: Date;
}

export function setEntry(
	props: Props,
	name: string,
	type: string,
	value: JsonValue | null,
): Props {
	const key =
		Object.keys(props).find((k) => k.toLowerCase() === name.toLowerCase()) ??
		name;
	if (value === null || value === false) {
		const { [key]: _gone, ...rest } = props;
		return rest;
	}
	const existing = props[key];
	const base = isObj(existing) ? existing : {};
	return { ...props, [key]: { ...base, type, value } };
}

/**
 * Apply a change to a task note's properties. Other properties, and anything
 * unknown inside them, are untouched. Null removes a field. Returns the same
 * note when its properties are not an object (nothing is edited).
 */
export function patchTask(note: Note, patch: TaskPatch): Note {
	let props = headerProps(note.header);
	if (!props) return note;
	if (patch.status !== undefined) {
		props = setEntry(props, "Status", "text", patch.status);
		props = setEntry(
			props,
			"Closed",
			"text",
			patch.status === "closed"
				? (patch.now ?? new Date()).toISOString()
				: null,
		);
	}
	const map: [keyof TaskPatch, string, string][] = [
		["priority", "Priority", "text"],
		["recurrence", "Recurrence", "text"],
		["due", "Due", "date"],
		["dueTime", "Due time", "text"],
		["scheduledDate", "Scheduled", "date"],
		["scheduledTime", "Start", "text"],
		["durationMinutes", "Duration", "number"],
		["number", "Number", "number"],
	];
	for (const [field, name, type] of map) {
		const v = patch[field];
		if (v !== undefined)
			props = setEntry(props, name, type, v as JsonValue | null);
	}
	if (patch.starred !== undefined) {
		props = setEntry(props, "Starred", "checkbox", patch.starred ? true : null);
	}
	const header = withProps(note.header, props);
	return {
		...note,
		header:
			patch.title !== undefined && patch.title.trim() !== ""
				? { ...header, title: patch.title.trim() }
				: header,
	};
}
