import { Check, ChevronLeft, ChevronRight, Flag, Plus } from "lucide-react";
import {
	type KeyboardEvent,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
	addDaysToKey,
	addMonthsToKey,
	monthGrid,
	weekDays,
} from "../../core/planner/dates";
import {
	chipOverflow,
	dayDots,
	isDeadlineOn,
	isDone,
	type PlannerTask,
	startTimeOn,
	taskOnDate,
	taskSlot,
	timedLanes,
} from "../../core/planner/rules";
import {
	dayNum,
	fmtDay,
	fmtMonth,
	fmtShort,
	fmtWeekday,
	hourLabel,
} from "./fmt";

type View = "day" | "week" | "month";
const HOUR = 44;
const HOURS = Array.from({ length: 24 }, (_, h) => h);

export function CalendarView({
	date,
	today,
	tasks,
	loggedDays,
	selected,
	writable,
	onDate,
	onSelect,
	onAdd,
}: {
	date: string;
	today: string;
	tasks: PlannerTask[];
	loggedDays: ReadonlySet<string>;
	selected: string | null;
	writable: boolean;
	onDate: (d: string) => void;
	onSelect: (t: PlannerTask) => void;
	onAdd: (date: string, time?: string) => void;
}) {
	const [view, setView] = useState<View>("week");
	const scroller = useRef<HTMLDivElement>(null);
	// biome-ignore lint/correctness/useExhaustiveDependencies: scroll to the morning when the view or day changes
	useEffect(() => {
		if (scroller.current) scroller.current.scrollTop = 7 * HOUR;
	}, [view, date]);
	const days = view === "day" ? [date] : weekDays(date);
	const title =
		view === "month"
			? fmtMonth(date)
			: view === "day"
				? fmtDay(date)
				: `${fmtShort(days[0] as string)} – ${fmtShort(days[6] as string)}`;
	const move = (n: number) =>
		onDate(
			view === "month"
				? addMonthsToKey(date, n)
				: addDaysToKey(date, n * (view === "week" ? 7 : 1)),
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
				.querySelector<HTMLButtonElement>(`[data-plan-date="${next}"]`)
				?.focus(),
		);
	};
	const grid = view === "month" ? monthGrid(date) : [];
	return (
		<section className="plan-card plan-calendar" aria-label="Calendar">
			<header className="plan-card-head">
				<h2>{title}</h2>
				<div className="plan-actions">
					<Button variant="secondary" size="sm" onClick={() => onDate(today)}>
						Today
					</Button>
					<Button
						variant="ghost"
						size="icon"
						aria-label={`Previous ${view}`}
						onClick={() => move(-1)}
					>
						<ChevronLeft />
					</Button>
					<Button
						variant="ghost"
						size="icon"
						aria-label={`Next ${view}`}
						onClick={() => move(1)}
					>
						<ChevronRight />
					</Button>
					<Tabs value={view} onValueChange={(v) => setView(v as View)}>
						<TabsList aria-label="Calendar view">
							{(["day", "week", "month"] as const).map((v) => (
								<TabsTrigger key={v} value={v}>
									{v[0]?.toUpperCase()}
									{v.slice(1)}
								</TabsTrigger>
							))}
						</TabsList>
					</Tabs>
				</div>
			</header>
			{view === "month" ? (
				<div className="plan-month">
					<div className="plan-month-labels">
						{grid.slice(0, 7).map((k) => (
							<span key={k}>{fmtWeekday(k)}</span>
						))}
					</div>
					<div className="plan-month-days">
						{grid.map((key) => {
							const items = tasks.filter((t) => taskOnDate(t, key));
							const { shown, more } = chipOverflow(items);
							const dots = dayDots(items, today, key);
							const done = tasks.filter(
								(t) => isDone(t) && t.closedAt?.slice(0, 10) === key,
							).length;
							const logged = loggedDays.has(key);
							return (
								<div
									key={key}
									className={cn(
										"plan-month-day",
										key === date && "is-selected",
										key === today && "is-today",
										key.slice(0, 7) !== date.slice(0, 7) && "is-outside",
									)}
								>
									<div className="plan-month-head">
										<button
											type="button"
											data-plan-date={key}
											className="plan-date"
											aria-pressed={key === date}
											tabIndex={key === date ? 0 : -1}
											aria-label={`${fmtDay(key)}${items.length ? `, ${items.length} ${items.length === 1 ? "item" : "items"}` : ""}`}
											onKeyDown={(e) => onKey(e, key)}
											onClick={() => onDate(key)}
										>
											{dayNum(key)}
										</button>
										{items.length > 0 && (
											<span className="plan-dots" aria-hidden>
												{dots.dots.map((k, i) => (
													<span
														// biome-ignore lint/suspicious/noArrayIndexKey: at most three identical dots
														key={`${key}${i}`}
														className={cn("plan-dot", `is-${k}`)}
													/>
												))}
												{dots.more > 0 && (
													<span className="plan-dot-more">+{dots.more}</span>
												)}
											</span>
										)}
										{(logged || done > 0) && (
											<span
												className="plan-day-meta"
												title={[
													logged && "Daily log written",
													done > 0 && `${done} closed`,
												]
													.filter(Boolean)
													.join(" · ")}
											>
												{logged && "Log"}
												{logged && done > 0 && " · "}
												{done > 0 && (
													<>
														<Check aria-hidden />
														{done}
													</>
												)}
											</span>
										)}
										{writable && (
											<button
												type="button"
												className="plan-add-day"
												aria-label={`Add on ${fmtShort(key)}`}
												onClick={() => onAdd(key)}
											>
												<Plus />
											</button>
										)}
									</div>
									<div className="plan-chips">
										{shown.map((t) => (
											<Item
												key={t.path}
												task={t}
												date={key}
												selected={selected}
												onSelect={onSelect}
											/>
										))}
										{more > 0 && (
											<button
												type="button"
												className="plan-more"
												onClick={() => {
													onDate(key);
													setView("day");
												}}
											>
												+{more} more
											</button>
										)}
									</div>
								</div>
							);
						})}
					</div>
				</div>
			) : (
				<div className="plan-schedule">
					<div
						className="plan-week-head"
						style={{
							gridTemplateColumns: `3rem repeat(${days.length}, minmax(0, 1fr))`,
						}}
					>
						<span />
						{days.map((key) => (
							<button
								key={key}
								type="button"
								data-plan-date={key}
								className={cn(
									"plan-week-date",
									key === date && "is-selected",
									key === today && "is-today",
								)}
								aria-pressed={key === date}
								tabIndex={key === date ? 0 : -1}
								onKeyDown={(e) => onKey(e, key)}
								onClick={() => onDate(key)}
							>
								<span>{fmtWeekday(key)}</span>
								<strong>{dayNum(key)}</strong>
							</button>
						))}
					</div>
					<div
						className="plan-allday"
						style={{
							gridTemplateColumns: `3rem repeat(${days.length}, minmax(0, 1fr))`,
						}}
					>
						<span className="plan-time-label">All-day / Due</span>
						{days.map((key) => (
							<div key={key} className="plan-allday-cell">
								{tasks
									.filter((t) => {
										const s = taskSlot(t);
										return (
											(s.date === key && !s.time) ||
											(t.due === key && s.date !== key)
										);
									})
									.map((t) => (
										<Item
											key={t.path}
											task={t}
											date={key}
											selected={selected}
											onSelect={onSelect}
										/>
									))}
							</div>
						))}
					</div>
					<div className="plan-time-scroll" ref={scroller}>
						<div
							className="plan-time-grid"
							style={{
								gridTemplateColumns: `3rem repeat(${days.length}, minmax(0, 1fr))`,
								height: 24 * HOUR,
							}}
						>
							<div className="plan-hours">
								{HOURS.map((h) => (
									<span key={h} style={{ top: h * HOUR }}>
										{hourLabel(h)}
									</span>
								))}
							</div>
							{days.map((key) => (
								<TimedDay
									key={key}
									date={key}
									today={today}
									tasks={tasks}
									selected={selected}
									writable={writable}
									onSelect={onSelect}
									onAdd={onAdd}
								/>
							))}
						</div>
					</div>
				</div>
			)}
			{view === "month" && (
				<Agenda
					date={date}
					tasks={tasks}
					selected={selected}
					writable={writable}
					onSelect={onSelect}
					onAdd={onAdd}
				/>
			)}
		</section>
	);
}

function Item({
	task,
	date,
	selected,
	onSelect,
}: {
	task: PlannerTask;
	date: string;
	selected: string | null;
	onSelect: (t: PlannerTask) => void;
}) {
	const time = startTimeOn(task, date);
	const deadline = isDeadlineOn(task, date);
	return (
		<button
			type="button"
			className={cn(
				"plan-event",
				isDone(task) && "is-done",
				selected === task.path && "is-active",
				task.kind === "event" && "is-event",
			)}
			aria-pressed={selected === task.path}
			title={`${task.title}${task.due ? ` · Due ${task.due}` : ""}`}
			onClick={() => onSelect(task)}
		>
			{isDone(task) ? (
				<Check aria-hidden />
			) : deadline ? (
				<Flag aria-hidden />
			) : null}
			{deadline && <span className="sr-only">Due: </span>}
			{time && <span className="plan-event-time">{time}</span>}
			<span className="plan-event-title">{task.title}</span>
		</button>
	);
}

function TimedDay({
	date,
	today,
	tasks,
	selected,
	writable,
	onSelect,
	onAdd,
}: {
	date: string;
	today: string;
	tasks: PlannerTask[];
	selected: string | null;
	writable: boolean;
	onSelect: (t: PlannerTask) => void;
	onAdd: (d: string, time?: string) => void;
}) {
	const lanes = useMemo(() => timedLanes(tasks, date), [tasks, date]);
	return (
		<div className={cn("plan-timed-day", date === today && "is-today")}>
			{writable &&
				HOURS.map((h) => (
					<button
						key={h}
						type="button"
						className="plan-hour-cell"
						style={{ top: h * HOUR, height: HOUR }}
						aria-label={`Add on ${fmtShort(date)} at ${hourLabel(h)}`}
						onClick={() => onAdd(date, hourLabel(h))}
					/>
				))}
			{lanes.map(({ task, start, end, lane, lanes: n }) => (
				<button
					key={task.path}
					type="button"
					className={cn(
						"plan-timed-event",
						isDone(task) && "is-done",
						selected === task.path && "is-active",
						task.kind === "event" && "is-event",
					)}
					aria-pressed={selected === task.path}
					style={{
						top: (start / 60) * HOUR,
						height: Math.max(((end - start) / 60) * HOUR - 2, 18),
						left: `${(lane / n) * 100}%`,
						width: `${100 / n}%`,
					}}
					onClick={() => onSelect(task)}
				>
					<span className="plan-timed-title">
						{isDone(task) && "✓ "}
						{task.title}
					</span>
					<span className="plan-timed-meta">
						{taskSlot(task).time}
						{task.durationMinutes ? ` · ${task.durationMinutes}m` : ""}
					</span>
				</button>
			))}
		</div>
	);
}

function Agenda({
	date,
	tasks,
	selected,
	writable,
	onSelect,
	onAdd,
}: {
	date: string;
	tasks: PlannerTask[];
	selected: string | null;
	writable: boolean;
	onSelect: (t: PlannerTask) => void;
	onAdd: (d: string) => void;
}) {
	const items = tasks.filter((t) => taskOnDate(t, date));
	return (
		<section className="plan-agenda" aria-label={`Items on ${fmtDay(date)}`}>
			<div className="plan-agenda-head">
				<strong>{fmtDay(date)}</strong>
				<span>
					{items.length
						? `${items.length} ${items.length === 1 ? "item" : "items"}`
						: "Nothing scheduled"}
				</span>
				{writable && (
					<Button
						variant="ghost"
						size="icon"
						aria-label={`Add on ${fmtShort(date)}`}
						onClick={() => onAdd(date)}
					>
						<Plus />
					</Button>
				)}
			</div>
			{items.length > 0 && (
				<ul>
					{items.map((t) => (
						<li key={t.path}>
							<Item
								task={t}
								date={date}
								selected={selected}
								onSelect={onSelect}
							/>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}
