/** Date keys are `YYYY-MM-DD`. Nothing here reads the clock: "today" is always a parameter. */

export function validDateKey(value: unknown): value is string {
	if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
		return false;
	}
	const date = new Date(`${value}T12:00:00Z`);
	return (
		Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
	);
}

const noon = (key: string) => new Date(`${key}T12:00:00Z`);

export function addDaysToKey(key: string, days: number): string {
	const date = noon(key);
	date.setUTCDate(date.getUTCDate() + days);
	return date.toISOString().slice(0, 10);
}

/** Whole days from `to` to `from` (positive when `from` is later). NaN for a bad key. */
export function daysBetween(from: string, to: string): number {
	if (!validDateKey(from) || !validDateKey(to)) return Number.NaN;
	return Math.round((noon(from).getTime() - noon(to).getTime()) / 86_400_000);
}

/** 0 = Sunday. */
export function weekdayOfKey(key: string): number {
	return noon(key).getUTCDay();
}

export function keyOfDate(date: Date): string {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, "0");
	const d = String(date.getDate()).padStart(2, "0");
	return `${y}-${m}-${d}`;
}

/** The first day (a key) of the week containing `key`. `weekStartsOn` 0 = Sunday. */
export function startOfWeekKey(key: string, weekStartsOn = 0): string {
	return addDaysToKey(key, -((weekdayOfKey(key) - weekStartsOn + 7) % 7));
}

export function startOfMonthKey(key: string): string {
	return `${key.slice(0, 7)}-01`;
}

export function endOfMonthKey(key: string): string {
	const first = startOfMonthKey(key);
	const next = noon(first);
	next.setUTCMonth(next.getUTCMonth() + 1);
	return addDaysToKey(next.toISOString().slice(0, 10), -1);
}

/** Move by whole months, keeping the day where it exists (31st clamps to month end). */
export function addMonthsToKey(key: string, months: number): string {
	const [y, m, d] = key.split("-").map(Number) as [number, number, number];
	const target = new Date(Date.UTC(y, m - 1 + months, 1, 12));
	const last = new Date(
		Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0, 12),
	).getUTCDate();
	target.setUTCDate(Math.min(d, last));
	return target.toISOString().slice(0, 10);
}

/** Every day of the month grid for the month containing `key`: four to six whole weeks. */
export function monthGrid(key: string, weekStartsOn = 0): string[] {
	const start = startOfWeekKey(startOfMonthKey(key), weekStartsOn);
	const weeks = Math.ceil((daysBetween(endOfMonthKey(key), start) + 1) / 7);
	return Array.from({ length: weeks * 7 }, (_, i) => addDaysToKey(start, i));
}

export function weekDays(key: string, weekStartsOn = 0): string[] {
	const start = startOfWeekKey(key, weekStartsOn);
	return Array.from({ length: 7 }, (_, i) => addDaysToKey(start, i));
}

export const validTime = (value: unknown): value is string =>
	typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
