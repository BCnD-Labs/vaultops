import { ChevronLeft, ChevronRight } from "lucide-react";
import { type KeyboardEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
	addDaysToKey,
	addMonthsToKey,
	monthGrid,
} from "../../core/planner/dates";
import {
	dayDots,
	type PlannerTask,
	taskOnDate,
} from "../../core/planner/rules";
import { weekStartsOnValue } from "../settings";
import { useSetting } from "../useSetting";
import { dayNum, fmtMonth, fmtWeekday } from "./fmt";

/**
 * A month grid for picking the day: today is a ring, the chosen day a filled
 * pill, dots show open / overdue / closed items, and a small mark shows a day
 * with a log. Arrow keys move by a day or a week.
 */
export function MiniCalendar({
	date,
	today,
	tasks,
	loggedDays,
	onDate,
}: {
	date: string;
	today: string;
	tasks: PlannerTask[];
	loggedDays: ReadonlySet<string>;
	onDate: (d: string) => void;
}) {
	const [month, setMonth] = useState(date);
	// Follow the chosen day when it leaves the shown month.
	const [seen, setSeen] = useState(date);
	if (seen !== date) {
		setSeen(date);
		if (date.slice(0, 7) !== month.slice(0, 7)) setMonth(date);
	}
	const grid = monthGrid(
		month,
		weekStartsOnValue(useSetting("planner.weekStartsOn")),
	);
	const onKey = (e: KeyboardEvent, key: string) => {
		const step = (
			{ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 } as Record<
				string,
				number
			>
		)[e.key];
		if (step === undefined) return;
		e.preventDefault();
		const next = addDaysToKey(key, step);
		onDate(next);
		requestAnimationFrame(() =>
			document
				.querySelector<HTMLButtonElement>(`[data-mini-date="${next}"]`)
				?.focus(),
		);
	};
	return (
		<div className="mini-cal">
			<div className="mini-cal-head">
				<strong>{fmtMonth(month)}</strong>
				<Button
					variant="ghost"
					size="icon"
					aria-label="Previous month"
					onClick={() => setMonth(addMonthsToKey(month, -1))}
				>
					<ChevronLeft />
				</Button>
				<Button
					variant="secondary"
					size="sm"
					onClick={() => {
						setMonth(today);
						onDate(today);
					}}
				>
					Today
				</Button>
				<Button
					variant="ghost"
					size="icon"
					aria-label="Next month"
					onClick={() => setMonth(addMonthsToKey(month, 1))}
				>
					<ChevronRight />
				</Button>
			</div>
			<div className="mini-cal-grid">
				{grid.slice(0, 7).map((k) => (
					<span key={k} className="mini-cal-label">
						{fmtWeekday(k).slice(0, 2)}
					</span>
				))}
				{grid.map((key) => {
					const items = tasks.filter((t) => taskOnDate(t, key));
					const dots = dayDots(items, today, key);
					return (
						<button
							key={key}
							type="button"
							data-mini-date={key}
							className={cn(
								"mini-cal-day",
								key === date && "is-selected",
								key === today && "is-today",
								key.slice(0, 7) !== month.slice(0, 7) && "is-outside",
							)}
							aria-pressed={key === date}
							aria-label={`${key}${items.length ? `, ${items.length} ${items.length === 1 ? "item" : "items"}` : ""}${loggedDays.has(key) ? ", has a log" : ""}`}
							tabIndex={key === date ? 0 : -1}
							onKeyDown={(e) => onKey(e, key)}
							onClick={() => onDate(key)}
						>
							<span>{dayNum(key)}</span>
							<span className="mini-cal-marks" aria-hidden>
								{dots.dots.slice(0, 3).map((k, i) => (
									// biome-ignore lint/suspicious/noArrayIndexKey: at most three identical dots
									<i key={`${key}${i}`} className={cn("plan-dot", `is-${k}`)} />
								))}
								{loggedDays.has(key) && <i className="plan-dot is-log" />}
							</span>
						</button>
					);
				})}
			</div>
		</div>
	);
}
