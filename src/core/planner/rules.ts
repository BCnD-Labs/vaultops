/**
 * Pure task rules: which group a task is in, how tasks sort, the Today / Next /
 * All / Done views, search, and the quick-add parser. Ported from Blackwall's
 * planner. "Today" is always a `YYYY-MM-DD` parameter.
 */
import { addDaysToKey, daysBetween, validDateKey, weekdayOfKey } from "./dates";

export type TaskStatus = "open" | "closed";
export type TaskPriority = "none" | "low" | "medium" | "high";

/** What the planner knows about one task. Built from a note's properties. */
export interface PlannerTask {
	/** Vault path of the task's note. */
	path: string;
	/** Issue-style number, `#12`. Never reused. 0 when the note has none yet. */
	number: number;
	title: string;
	status: TaskStatus;
	kind: "task" | "event";
	priority?: Exclude<TaskPriority, "none">;
	recurrence?: string;
	due?: string;
	/** `HH:mm` on the due date. */
	dueTime?: string;
	scheduledDate?: string;
	scheduledTime?: string;
	durationMinutes?: number;
	starred: boolean;
	labels: string[];
	/** ISO timestamps. */
	createdAt?: string;
	closedAt?: string;
	/** ISO timestamp of the last saved reflection; absent when never reflected. */
	reflectedAt?: string;
	/** First lines of the note body, for search. */
	preview: string;
}

export const isDone = (t: PlannerTask) => t.status === "closed";

export type TaskGroup =
	| "Overdue"
	| "Today"
	| "Tomorrow"
	| "Next 7 days"
	| "Later"
	| "No date";
export const GROUP_ORDER: TaskGroup[] = [
	"Overdue",
	"Today",
	"Tomorrow",
	"Next 7 days",
	"Later",
	"No date",
];

/** Days from today to `due`; negative is overdue. */
export const daysUntil = (due: string, today: string) =>
	daysBetween(due, today);

export function groupOf(t: PlannerTask, today: string): TaskGroup {
	if (!t.due) return "No date";
	const n = daysUntil(t.due, today);
	if (n < 0) return "Overdue";
	if (n === 0) return "Today";
	if (n === 1) return "Tomorrow";
	if (n <= 7) return "Next 7 days";
	return "Later";
}

const PRIORITY_RANK: Record<TaskPriority, number> = {
	high: 3,
	medium: 2,
	low: 1,
	none: 0,
};

/** Dated first by date, then undated; starred and higher priority first within a day. Done: newest first. */
export function compareTasks(a: PlannerTask, b: PlannerTask): number {
	const ad = isDone(a);
	const bd = isDone(b);
	if (ad && bd) return (b.closedAt ?? "").localeCompare(a.closedAt ?? "");
	if (ad !== bd) return ad ? 1 : -1;
	const adue = a.due ?? "9999-99-99";
	const bdue = b.due ?? "9999-99-99";
	if (adue !== bdue) return adue.localeCompare(bdue);
	if (a.starred !== b.starred) return a.starred ? -1 : 1;
	const ap = PRIORITY_RANK[a.priority ?? "none"];
	const bp = PRIORITY_RANK[b.priority ?? "none"];
	if (ap !== bp) return bp - ap;
	return a.number - b.number || a.path.localeCompare(b.path);
}

export const isOverdue = (t: PlannerTask, today: string) =>
	!isDone(t) && !!t.due && daysUntil(t.due, today) < 0;

export type TaskTab = "today" | "next" | "all" | "done";
export const TASK_TABS: { value: TaskTab; label: string }[] = [
	{ value: "today", label: "Today" },
	{ value: "next", label: "Next" },
	{ value: "all", label: "All" },
	{ value: "done", label: "Done" },
];

/** Today = open, due today or overdue. Next = open, due later (undated only in All). */
export function inTab(t: PlannerTask, tab: TaskTab, today: string): boolean {
	if (t.kind === "event") return false;
	if (tab === "done") return isDone(t);
	if (isDone(t)) return false;
	if (tab === "today") return !!t.due && daysUntil(t.due, today) <= 0;
	if (tab === "next") return !!t.due && daysUntil(t.due, today) > 0;
	return true;
}

export const TAB_GROUPS: Record<Exclude<TaskTab, "done">, TaskGroup[]> = {
	today: ["Overdue", "Today"],
	next: ["Tomorrow", "Next 7 days", "Later"],
	all: GROUP_ORDER,
};

export const normalizeSearch = (q: string) => q.trim().toLowerCase();

export function matchesSearch(t: PlannerTask, needle: string): boolean {
	if (!needle) return true;
	const hash = needle.startsWith("#") ? needle.slice(1) : null;
	if (hash !== null && /^\d+$/.test(hash)) return t.number === Number(hash);
	return (
		t.title.toLowerCase().includes(needle) ||
		t.preview.toLowerCase().includes(needle) ||
		t.labels.some((l) => l.toLowerCase().includes(needle))
	);
}

export interface TaskViewOptions {
	tab: TaskTab;
	today: string;
	query?: string;
	starredOnly?: boolean;
	/** Paths checked off in this view: they stay listed (struck through) until the tab changes. */
	lingering?: ReadonlySet<string>;
}

export function taskRows(
	tasks: readonly PlannerTask[],
	o: TaskViewOptions,
): PlannerTask[] {
	const needle = normalizeSearch(o.query ?? "");
	return tasks
		.filter(
			(t) =>
				t.kind !== "event" &&
				(inTab(t, o.tab, o.today) || !!o.lingering?.has(t.path)) &&
				matchesSearch(t, needle) &&
				(!o.starredOnly || t.starred),
		)
		.sort(compareTasks);
}

export function taskGroups(
	rows: readonly PlannerTask[],
	o: Pick<TaskViewOptions, "tab" | "today" | "lingering">,
): { name: TaskGroup | null; items: PlannerTask[] }[] {
	if (o.tab === "done") return [{ name: null, items: [...rows] }];
	const names = TAB_GROUPS[o.tab];
	return names
		.map((g) => ({
			name: g as TaskGroup | null,
			items: rows.filter(
				(t) =>
					groupOf(t, o.today) === g ||
					(isDone(t) && !!o.lingering?.has(t.path) && g === names[0]),
			),
		}))
		.filter((g) => g.items.length);
}

const WEEKDAYS = [
	"sunday",
	"monday",
	"tuesday",
	"wednesday",
	"thursday",
	"friday",
	"saturday",
];

/**
 * Parse an ISO date (`YYYY-MM-DD`) or natural-language date expression
 * ("today", "tomorrow"/"tmrw"/"tmr", "next week", "+3d"/"in 3 days", or a
 * weekday like "fri", "thurs", "monday", "next fri"). Returns `undefined` when
 * the input is empty or not recognized.
 */
export function parseDateInput(
	input: string,
	today: string,
): string | undefined {
	const raw = input.trim().toLowerCase();
	if (!raw) return undefined;
	if (validDateKey(raw as unknown)) return raw;
	if (raw === "today" || raw === "tod") return today;
	if (raw === "tomorrow" || raw === "tmrw" || raw === "tmr") {
		return addDaysToKey(today, 1);
	}
	if (raw === "yesterday") return addDaysToKey(today, -1);
	if (raw === "next week") return addDaysToKey(today, 7);
	const relDays = raw.match(/^(?:\+|in\s+)(\d+)\s*d(?:ays?)?$/);
	if (relDays) return addDaysToKey(today, Number(relDays[1]));
	const relWeeks = raw.match(/^(?:\+|in\s+)(\d+)\s*w(?:eeks?)?$/);
	if (relWeeks) return addDaysToKey(today, Number(relWeeks[1]) * 7);
	const nextDay = raw.match(/^(next\s+)?([a-z]+)$/);
	if (!nextDay) return undefined;
	const word = (nextDay[2] as string).replace(/^weds$/, "wed");
	const idx =
		word.length >= 3 ? WEEKDAYS.findIndex((d) => d.startsWith(word)) : -1;
	if (idx < 0) return undefined;
	const delta = (idx - weekdayOfKey(today) + 7) % 7;
	return addDaysToKey(today, nextDay[1] && delta === 0 ? 7 : delta);
}

/**
 * Pull a trailing date word off a quick-add title: "today", "tomorrow" / "tmrw" /
 * "tmr", or a weekday ("fri", "thurs", "friday": the next one, or today if it
 * matches). Anything else is left alone.
 */
export function parseQuickAdd(
	input: string,
	today: string,
): { title: string; due?: string } {
	const text = input.trim();
	const m = text.match(/\s+([a-z]+)$/i);
	if (!m) return { title: text };
	const title = text.slice(0, m.index).trim();
	if (!title) return { title: text };
	const due = parseDateInput(m[1] as string, today);
	if (!due) return { title: text };
	return { title, due };
}

// ---- Calendar helpers (ported from planner-utils) ----

/** When a task sits on the calendar: its own schedule if it has one, else the due date. */
export function taskSlot(t: PlannerTask): { date?: string; time?: string } {
	if (t.scheduledDate && validDateKey(t.scheduledDate)) {
		return { date: t.scheduledDate, time: t.scheduledTime };
	}
	return { date: t.due, time: t.dueTime };
}

export const taskOnDate = (t: PlannerTask, key: string) =>
	taskSlot(t).date === key || t.due === key;

/** A due time from 23:45 on means "end of day": shown as a deadline, not a start time. */
export const isEndOfDay = (time?: string) => !!time && time >= "23:45";

/** The start time to show for a task on a day, or undefined when there is no real one. */
export function startTimeOn(t: PlannerTask, key: string): string | undefined {
	const slot = taskSlot(t);
	if (slot.date !== key || !slot.time) return undefined;
	if (!t.scheduledDate && isEndOfDay(slot.time)) return undefined;
	return slot.time;
}

/** A deadline marker: due that day with no real start time and not scheduled elsewhere. */
export function isDeadlineOn(t: PlannerTask, key: string): boolean {
	if (t.kind === "event") return false;
	return t.due === key && !startTimeOn(t, key);
}

/** Month cell: up to three chips; with more, two chips and "+N more". */
export function chipOverflow<T>(items: readonly T[]): {
	shown: T[];
	more: number;
} {
	if (items.length <= 3) return { shown: [...items], more: 0 };
	return { shown: items.slice(0, 2), more: items.length - 2 };
}

export type DotKind = "open" | "overdue" | "done";

/** Dots for a narrow month cell: up to three, then +N. */
export function dayDots(
	items: readonly PlannerTask[],
	today: string,
	key: string,
): { dots: DotKind[]; more: number } {
	const kinds: DotKind[] = items.map((t) =>
		isDone(t)
			? "done"
			: isOverdue(t, today) && t.due === key
				? "overdue"
				: "open",
	);
	return { dots: kinds.slice(0, 3), more: Math.max(0, kinds.length - 3) };
}

const toMinutes = (time: string) =>
	Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

export interface TimedLane {
	task: PlannerTask;
	/** Minutes from midnight. */
	start: number;
	end: number;
	lane: number;
	lanes: number;
}

/**
 * Tasks with a real start time on a day, laid out side by side when they
 * overlap. Default length is 30 minutes; nothing runs past midnight.
 */
export function timedLanes(
	tasks: readonly PlannerTask[],
	key: string,
): TimedLane[] {
	const items = tasks
		.map((task) => {
			const time = startTimeOn(task, key);
			if (!time) return null;
			const start = toMinutes(time);
			const end = Math.min(1440, start + (task.durationMinutes ?? 30));
			return { task, start, end: Math.max(end, start + 15) };
		})
		.filter((v): v is { task: PlannerTask; start: number; end: number } => !!v)
		.sort((a, b) => a.start - b.start || a.end - b.end);
	const out: TimedLane[] = [];
	let cluster: typeof out = [];
	let clusterEnd = -1;
	const flush = () => {
		const lanes = Math.max(1, ...cluster.map((c) => c.lane + 1));
		for (const c of cluster) c.lanes = lanes;
		out.push(...cluster);
		cluster = [];
	};
	const laneEnds: number[] = [];
	for (const it of items) {
		if (cluster.length && it.start >= clusterEnd) {
			flush();
			laneEnds.length = 0;
		}
		let lane = laneEnds.findIndex((end) => end <= it.start);
		if (lane < 0) lane = laneEnds.length;
		laneEnds[lane] = it.end;
		cluster.push({ ...it, lane, lanes: 1 });
		clusterEnd = Math.max(clusterEnd, it.end);
	}
	if (cluster.length) flush();
	return out;
}
