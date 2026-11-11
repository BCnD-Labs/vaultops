import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { addDaysToKey } from "../../core/planner/dates";
import {
	completedOn,
	dueOn,
	type RecentEntry,
	weekStrip,
} from "../../core/planner/log-rules";
import type { PlannerTask } from "../../core/planner/rules";
import { weekStartsOnValue } from "../settings";
import { useSetting } from "../useSetting";
import { dayNum, fmtShort, fmtWeekday } from "./fmt";

/** Seven days around the open one: a dot marks a day with a log. */
export function LogWeekStrip({
	date,
	today,
	logged,
	onDate,
}: {
	date: string;
	today: string;
	logged: ReadonlySet<string>;
	onDate: (d: string) => void;
}) {
	const days = weekStrip(
		date,
		today,
		logged,
		weekStartsOnValue(useSetting("planner.weekStartsOn")),
	);
	return (
		<nav className="log-week" aria-label="Week">
			<Button
				variant="ghost"
				size="icon"
				aria-label="Previous week"
				onClick={() => onDate(addDaysToKey(date, -7))}
			>
				<ChevronLeft />
			</Button>
			<div className="log-week-days">
				{days.map((d) => (
					<button
						key={d.key}
						type="button"
						className={cn(
							"log-week-day",
							d.today && "is-today",
							d.selected && "is-selected",
						)}
						aria-pressed={d.selected}
						aria-label={`${fmtShort(d.key)}${d.has ? ", has a log" : ""}`}
						onClick={() => onDate(d.key)}
					>
						<span>{fmtWeekday(d.key).slice(0, 2)}</span>
						<strong>{dayNum(d.key)}</strong>
						<i className={cn("plan-dot log-week-dot", d.has && "is-log")} />
					</button>
				))}
			</div>
			<Button
				variant="ghost"
				size="icon"
				aria-label="Next week"
				onClick={() => onDate(addDaysToKey(date, 7))}
			>
				<ChevronRight />
			</Button>
		</nav>
	);
}

function TaskList({
	title,
	tasks,
	onOpen,
}: {
	title: string;
	tasks: PlannerTask[];
	onOpen: (t: PlannerTask) => void;
}) {
	if (tasks.length === 0) return null;
	return (
		<div className="log-list">
			<h3>{title}</h3>
			<ul>
				{tasks.map((t) => (
					<li key={t.path}>
						<button type="button" onClick={() => onOpen(t)}>
							{t.number > 0 && (
								<span className="log-recent-day">#{t.number}</span>
							)}
							<span className="log-recent-line">{t.title}</span>
						</button>
					</li>
				))}
			</ul>
		</div>
	);
}

/** What was closed on the open day, and what is still due on it. */
export function LogTaskLists({
	date,
	tasks,
	onOpen,
}: {
	date: string;
	tasks: readonly PlannerTask[];
	onOpen: (t: PlannerTask) => void;
}) {
	const done = completedOn(tasks, date);
	const due = dueOn(tasks, date);
	if (done.length === 0 && due.length === 0) return null;
	return (
		<section className="plan-card log-lists" aria-label="Tasks for this day">
			<TaskList title="Completed" tasks={done} onOpen={onOpen} />
			<TaskList title="Due" tasks={due} onOpen={onOpen} />
		</section>
	);
}

/** The latest days with a log, one line each. */
export function RecentLogs({
	entries,
	date,
	onDate,
}: {
	entries: RecentEntry[];
	date: string;
	onDate: (d: string) => void;
}) {
	if (entries.length === 0) return null;
	return (
		<section className="plan-card log-lists" aria-label="Recent entries">
			<div className="log-list">
				<h3>Recent entries</h3>
				<ul>
					{entries.map((e) => (
						<li key={e.day}>
							<button
								type="button"
								aria-current={e.day === date ? "date" : undefined}
								onClick={() => onDate(e.day)}
							>
								<span className="log-recent-day">{fmtShort(e.day)}</span>
								<span className="log-recent-line">{e.preview}</span>
							</button>
						</li>
					))}
				</ul>
			</div>
		</section>
	);
}
