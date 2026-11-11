/**
 * Pure rules for the daily log's surroundings: the week strip, the tasks
 * completed or due on a day, and the recent-entries list. Ported from
 * Blackwall's log rules. Nothing here reads the clock: `today` is a parameter,
 * and the time zone offset can be passed so tests do not depend on the machine.
 */

import { keyOfDate, validDateKey, weekDays } from "./dates";
import { dayOfLogPath } from "./log";
import { compareTasks, isDone, type PlannerTask } from "./rules";

/**
 * The calendar day (`YYYY-MM-DD`) of a closing time. A bare date is taken as
 * that day. `offsetMinutes` is `Date#getTimezoneOffset()` (UTC minus local);
 * the machine's own is used when it is left out. Undefined for a bad value.
 */
export function closedDay(
	closedAt: string | undefined,
	offsetMinutes?: number,
): string | undefined {
	if (!closedAt) return undefined;
	if (validDateKey(closedAt)) return closedAt;
	const ms = Date.parse(closedAt);
	if (Number.isNaN(ms)) return undefined;
	if (offsetMinutes === undefined) return keyOfDate(new Date(ms));
	return new Date(ms - offsetMinutes * 60_000).toISOString().slice(0, 10);
}

/** Tasks closed on a day, earliest first. Events and open tasks never count. */
export function completedOn(
	tasks: readonly PlannerTask[],
	day: string,
	offsetMinutes?: number,
): PlannerTask[] {
	return tasks
		.filter(
			(t) =>
				t.kind === "task" &&
				isDone(t) &&
				closedDay(t.closedAt, offsetMinutes) === day,
		)
		.sort((a, b) => (a.closedAt ?? "").localeCompare(b.closedAt ?? ""));
}

/** Open tasks due on a day, in the planner's usual order. */
export function dueOn(
	tasks: readonly PlannerTask[],
	day: string,
): PlannerTask[] {
	return tasks
		.filter((t) => t.kind === "task" && !isDone(t) && t.due === day)
		.sort(compareTasks);
}

export interface StripDay {
	key: string;
	has: boolean;
	today: boolean;
	selected: boolean;
}

/** The seven days of the week around `day`, marking those with a log. */
export function weekStrip(
	day: string,
	today: string,
	logged: ReadonlySet<string>,
	weekStartsOn = 0,
): StripDay[] {
	return weekDays(day, weekStartsOn).map((key) => ({
		key,
		has: logged.has(key),
		today: key === today,
		selected: key === day,
	}));
}

/** The first line with words in it, without heading or bullet markers. */
export function previewLine(text: string, max = 90): string {
	const line = text
		.split("\n")
		.map((l) => l.replace(/^\s*(#+\s*|[-*]\s+)/, "").trim())
		.find(Boolean);
	return (line ?? "").slice(0, max);
}

export interface RecentEntry {
	day: string;
	path: string;
	preview: string;
}

/** The latest days up to `today` that have something written, newest first. */
export function recentEntries(
	rows: readonly { path: string; preview: string }[],
	today: string,
	limit = 7,
): RecentEntry[] {
	const out: RecentEntry[] = [];
	for (const row of rows) {
		const day = dayOfLogPath(row.path);
		const preview = previewLine(row.preview);
		if (day && preview && day <= today)
			out.push({ day, path: row.path, preview });
	}
	return out.sort((a, b) => b.day.localeCompare(a.day)).slice(0, limit);
}
