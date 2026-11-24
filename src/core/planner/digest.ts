/**
 * The journal's digests (pure): what happened on a day ("Today, so far"), a
 * week in numbers (the weekly review) and short prompts drawn from the data.
 * Nothing here reads the clock or the disk: days, notes, tasks and check-ins
 * are passed in, and prompt wording comes from editable templates.
 */
import type { Note } from "../note-format";
import {
	CHECK_IN_SLOTS,
	readCheckIn,
	SCALE_FIELD_KEYS,
	SCALE_FIELDS,
	type ScaleField,
} from "./check-in";
import { addDaysToKey, daysBetween, keyOfDate } from "./dates";
import { dayOfLogPath } from "./log";
import { closedDay, completedOn } from "./log-rules";
import { isDone, type PlannerTask } from "./rules";

/** What the digests need of a note. */
export interface DigestNote {
	path: string;
	title: string;
	/** Last saved, in milliseconds. */
	updatedAt?: number;
	tags: readonly string[];
	kind?: "note" | "canvas";
	/** Set for planner tasks and events, which are counted as tasks instead. */
	task?: unknown;
}

/** A day's average of each check-in scale over the slots filled in. */
export type DayScales = Partial<Record<ScaleField, number>>;

const dayOf = (ms: number) => keyOfDate(new Date(ms));
const mean = (values: number[]) =>
	values.length === 0
		? undefined
		: values.reduce((a, b) => a + b, 0) / values.length;
const isPlainNote = (n: DigestNote) => !n.task && !dayOfLogPath(n.path);

export interface DaySummary {
	/** Notes last saved on the day, newest first (not tasks or journal pages). */
	edited: DigestNote[];
	/** Tasks closed on the day. */
	done: PlannerTask[];
}

export function daySummary(
	day: string,
	notes: readonly DigestNote[],
	tasks: readonly PlannerTask[],
): DaySummary {
	const edited = notes
		.filter((n) => isPlainNote(n) && n.updatedAt && dayOf(n.updatedAt) === day)
		.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
	return { edited, done: completedOn(tasks, day) };
}

/** A journal page's check-ins as one average per scale (over the slots filled in). */
export function dayScales(note: Note): DayScales {
	const out: DayScales = {};
	for (const field of SCALE_FIELD_KEYS) {
		const values = CHECK_IN_SLOTS.flatMap((slot) => {
			const v = readCheckIn(note, slot).scales[field];
			return v === undefined ? [] : [v];
		});
		const avg = mean(values);
		if (avg !== undefined) out[field] = avg;
	}
	return out;
}

export interface WeekReview {
	from: string;
	to: string;
	tasksDone: number;
	notesEdited: number;
	/** Journal pages written in the week. */
	daysWritten: number;
	/** The week's average per scale, and the previous week's for comparison. */
	scales: { field: ScaleField; label: string; avg: number; before?: number }[];
}

function scaleAvg(
	scales: ReadonlyMap<string, DayScales>,
	from: string,
	to: string,
	field: ScaleField,
): number | undefined {
	const values: number[] = [];
	for (const [day, s] of scales) {
		const v = s[field];
		if (day >= from && day <= to && v !== undefined) values.push(v);
	}
	return mean(values);
}

/** The week `from`..`from + 6` in numbers. `scales` holds days' check-in averages. */
export function weekReview(
	from: string,
	notes: readonly DigestNote[],
	tasks: readonly PlannerTask[],
	scales: ReadonlyMap<string, DayScales>,
): WeekReview {
	const to = addDaysToKey(from, 6);
	const inWeek = (day: string | null | undefined) =>
		!!day && day >= from && day <= to;
	const beforeFrom = addDaysToKey(from, -7);
	const beforeTo = addDaysToKey(from, -1);
	return {
		from,
		to,
		tasksDone: tasks.filter(
			(t) => t.kind === "task" && isDone(t) && inWeek(closedDay(t.closedAt)),
		).length,
		notesEdited: notes.filter(
			(n) => isPlainNote(n) && n.updatedAt && inWeek(dayOf(n.updatedAt)),
		).length,
		daysWritten: notes.filter((n) => inWeek(dayOfLogPath(n.path))).length,
		scales: SCALE_FIELD_KEYS.flatMap((field) => {
			const avg = scaleAvg(scales, from, to, field);
			if (avg === undefined) return [];
			const before = scaleAvg(scales, beforeFrom, beforeTo, field);
			return [
				{
					field,
					label: SCALE_FIELDS[field].label,
					avg,
					...(before === undefined ? {} : { before }),
				},
			];
		}),
	};
}

/* Prompts */

export const PROMPT_KINDS = ["dip", "stale", "overdue", "streak"] as const;
export type PromptKind = (typeof PROMPT_KINDS)[number];

/** The wording used until the user writes their own. `{name}` is filled in. */
export const DEFAULT_PROMPTS: Record<PromptKind, string> = {
	dip: "Your {field} has dipped {count} days running.",
	stale: "You haven't touched {tag} in {days} days.",
	overdue: "Overdue tasks waiting: {count}.",
	streak: "{count} days of journaling in a row.",
};

/** What each prompt fills in, for the settings help text. */
export const PROMPT_PLACEHOLDERS: Record<PromptKind, string> = {
	dip: "{field}, {count}",
	stale: "{tag}, {days}",
	overdue: "{count}",
	streak: "{count}",
};

export interface Prompt {
	kind: PromptKind;
	values: Record<string, string>;
}

/** Fill a template: `{name}` becomes the value; unknown names stay as typed. */
export function fillPrompt(
	template: string,
	values: Record<string, string>,
): string {
	return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
		Object.hasOwn(values, name) ? (values[name] as string) : whole,
	);
}

export interface PromptInput {
	today: string;
	notes: readonly DigestNote[];
	tasks: readonly PlannerTask[];
	scales: ReadonlyMap<string, DayScales>;
	/** A tag counts as stale after this many days untouched. */
	staleDays?: number;
}

/** Days in a row, ending today or yesterday, that pass `has`. */
function runEndingNear(today: string, has: (day: string) => boolean): number {
	let day = has(today) ? today : addDaysToKey(today, -1);
	let count = 0;
	while (has(day)) {
		count++;
		day = addDaysToKey(day, -1);
	}
	return count;
}

/** Short observations about the last days, most pressing first. */
export function journalPrompts(input: PromptInput): Prompt[] {
	const { today, notes, tasks, scales } = input;
	const staleDays = input.staleDays ?? 10;
	const out: Prompt[] = [];

	// A scale lower each day for 3+ days, ending with the latest day that has it.
	for (const field of SCALE_FIELD_KEYS) {
		const days = [...scales.keys()]
			.filter((d) => d <= today && scales.get(d)?.[field] !== undefined)
			.sort();
		let run = 1;
		for (let i = days.length - 1; i > 0; i--) {
			const now = scales.get(days[i] as string)?.[field] as number;
			const prev = scales.get(days[i - 1] as string)?.[field] as number;
			if (
				now < prev &&
				daysBetween(days[i] as string, days[i - 1] as string) === 1
			)
				run++;
			else break;
		}
		if (run >= 3)
			out.push({
				kind: "dip",
				values: {
					field: SCALE_FIELDS[field].label.toLowerCase(),
					count: String(run),
				},
			});
	}

	const overdue = tasks.filter(
		(t) => !isDone(t) && t.due !== undefined && t.due < today,
	).length;
	if (overdue > 0)
		out.push({ kind: "overdue", values: { count: String(overdue) } });

	// Tags on 3+ notes whose newest note is staleDays or more old; the stalest first.
	const last = new Map<string, { tag: string; at: number; count: number }>();
	for (const n of notes) {
		if (!isPlainNote(n) || !n.updatedAt) continue;
		for (const tag of n.tags) {
			const key = tag.toLowerCase();
			const seen = last.get(key);
			if (!seen) last.set(key, { tag, at: n.updatedAt, count: 1 });
			else {
				seen.count++;
				seen.at = Math.max(seen.at, n.updatedAt);
			}
		}
	}
	const stale = [...last.values()]
		.map((t) => ({ ...t, days: daysBetween(today, dayOf(t.at)) }))
		.filter((t) => t.count >= 3 && t.days >= staleDays)
		.sort((a, b) => b.days - a.days)
		.slice(0, 2);
	for (const t of stale)
		out.push({
			kind: "stale",
			values: { tag: t.tag, days: String(t.days) },
		});

	const written = new Set(
		notes.flatMap((n) => {
			const day = dayOfLogPath(n.path);
			return day ? [day] : [];
		}),
	);
	const streak = runEndingNear(today, (d) => written.has(d));
	if (streak >= 3)
		out.push({ kind: "streak", values: { count: String(streak) } });
	return out;
}
