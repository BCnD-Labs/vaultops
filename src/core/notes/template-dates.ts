import {
	addDaysToKey,
	addMonthsToKey,
	endOfMonthKey,
	keyOfDate,
	startOfMonthKey,
	startOfWeekKey,
	validDateKey,
	weekdayOfKey,
} from "../planner/dates";

const weekdays =
	"sunday monday tuesday wednesday thursday friday saturday".split(" ");
const months = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");
const shortDays = "Sun Mon Tue Wed Thu Fri Sat".split(" ");

/** Resolve calendar expressions against the local date, without reading the clock. */
export function templateDateKey(
	expression: string,
	now: Date,
	weekStartsOn: 0 | 1 = 0,
): string | null {
	const input = expression.trim().toLowerCase();
	const match =
		/^(?:(today|tomorrow|yesterday|(?:next|last|this) (?:sunday|monday|tuesday|wednesday|thursday|friday|saturday)|(?:start|end) of (?:week|month|year)))?(?:\s*([+-])\s*(\d+)\s*(days?|d|weeks?|w|months?|years?|y))?$/.exec(
			input,
		);
	if (!match || (!match[1] && !match[2])) return null;
	let key = keyOfDate(now);
	if (!validDateKey(key)) return null;
	const base = match[1] ?? "today";
	try {
		if (base === "tomorrow" || base === "yesterday")
			key = addDaysToKey(key, base === "tomorrow" ? 1 : -1);
		else if (/^(next|last|this) /.test(base)) {
			const [direction, day] = base.split(" ");
			const target = weekdays.indexOf(day ?? "");
			const current = weekdayOfKey(key);
			const delta =
				direction === "this"
					? ((target - weekStartsOn + 7) % 7) -
						((current - weekStartsOn + 7) % 7)
					: direction === "next"
						? ((target - current + 6) % 7) + 1
						: -(((current - target + 6) % 7) + 1);
			key = addDaysToKey(key, delta);
		} else if (base.endsWith("of week")) {
			key = startOfWeekKey(key, weekStartsOn);
			if (base.startsWith("end")) key = addDaysToKey(key, 6);
		} else if (base.endsWith("of month"))
			key = base.startsWith("start")
				? startOfMonthKey(key)
				: endOfMonthKey(key);
		else if (base.endsWith("of year"))
			key = `${key.slice(0, 4)}-${base.startsWith("start") ? "01-01" : "12-31"}`;
		if (match[2]) {
			const amount = Number(match[3]) * (match[2] === "-" ? -1 : 1);
			if (!Number.isSafeInteger(amount)) return null;
			const unit = match[4] ?? "";
			key = unit.startsWith("month")
				? addMonthsToKey(key, amount)
				: unit.startsWith("y")
					? addMonthsToKey(key, amount * 12)
					: addDaysToKey(key, amount * (unit.startsWith("w") ? 7 : 1));
		}
		return validDateKey(key) ? key : null;
	} catch {
		return null;
	}
}

/** Tokens: YYYY year; MM/MMM month; D/DD day; ddd/dddd weekday. */
export function formatTemplateDate(key: string, format: string): string | null {
	if (
		!validDateKey(key) ||
		!format ||
		/[a-zA-Z]/.test(format.replace(/YYYY|MMMM|MMM|MM|dddd|ddd|DD|D/g, "")) ||
		format.includes("MMMM")
	)
		return null;
	const [year, month, day] = key.split("-");
	const weekday = weekdayOfKey(key);
	const values: Record<string, string> = {
		YYYY: year ?? "",
		MM: month ?? "",
		MMM: months[Number(month) - 1] ?? "",
		DD: day ?? "",
		D: String(Number(day)),
		ddd: shortDays[weekday] ?? "",
		dddd:
			weekdays[weekday]?.replace(/^./, (letter) => letter.toUpperCase()) ?? "",
	};
	return format.replace(
		/YYYY|MMM|MM|dddd|ddd|DD|D/g,
		(token) => values[token] ?? token,
	);
}

/** Resolve a signed minute or hour offset, including crossings of midnight. */
export function templateTime(expression: string, now: Date): Date | null {
	const match = /^\s*([+-])\s*(\d+)\s*([mh])\s*$/i.exec(expression);
	if (!match) return null;
	const amount =
		Number(match[2]) *
		(match[1] === "-" ? -1 : 1) *
		(match[3]?.toLowerCase() === "h" ? 60 : 1);
	if (!Number.isSafeInteger(amount)) return null;
	const result = new Date(now.getTime() + amount * 60_000);
	return Number.isFinite(result.getTime()) ? result : null;
}
