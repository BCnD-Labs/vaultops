import { GripVertical, Maximize2, Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SegmentedInput } from "@/components/ui/segmented";
import { cn } from "@/lib/utils";
import { logPath } from "../../core/planner/log";
import {
	type PlannerTask,
	startTimeOn,
	taskOnDate,
} from "../../core/planner/rules";
import {
	CalendarOptions,
	PlannerHomeZone,
	useCalendarDragSource,
} from "./CalendarDock";
import { CalendarPanel } from "./CalendarPanel";
import { DailyLog } from "./DailyLog";
import { NewItemDialog } from "./NewItemDialog";
import { usePlanner } from "./PlannerContext";
import { TaskDetailsDialog } from "./TaskInspector";
import { TaskList } from "./TaskList";
import "./planner.css";

type View = "tasks" | "log";
const VIEW_KEY = "vaultops:planner-view";
const VIEWS = [
	{ value: "tasks", label: "Tasks" },
	{ value: "log", label: "Log" },
] as const;

/** The picked day's events, timed ones by time (all-day first), then by title. */
function DayEvents({
	tasks,
	date,
	selected,
	onSelect,
}: {
	tasks: PlannerTask[];
	date: string;
	selected: string | null;
	onSelect: (t: PlannerTask) => void;
}) {
	const events = tasks
		.filter((t) => t.kind === "event" && taskOnDate(t, date))
		.map((t) => ({ t, time: startTimeOn(t, date) ?? "" }))
		.sort(
			(a, b) =>
				a.time.localeCompare(b.time) || a.t.title.localeCompare(b.t.title),
		);
	if (events.length === 0) return null;
	return (
		<section className="plan-events" aria-label="Events">
			<h3 className="plan-group">Events</h3>
			<ul>
				{events.map(({ t, time }) => (
					<li key={t.path}>
						<button
							type="button"
							className={cn(
								"plan-event-row",
								t.status === "closed" && "is-done",
								selected === t.path && "is-selected",
							)}
							onClick={() => onSelect(t)}
						>
							<i className="plan-dot is-event" aria-hidden />
							{time && <span className="plan-event-time">{time}</span>}
							<span className="plan-event-title">{t.title}</span>
						</button>
					</li>
				))}
			</ul>
		</section>
	);
}

function loadView(): View {
	try {
		return localStorage.getItem(VIEW_KEY) === "log" ? "log" : "tasks";
	} catch {
		return "tasks";
	}
}

/**
 * The planner in the right sidebar as one page: the calendar on top, then a
 * Tasks | Log switch with a "+" menu (new task or event), then what the switch
 * picked. The calendar can be dragged out by its grip (see CalendarDock); then
 * the page starts with the switch. Clicking a task opens its edit window.
 */
export function PlannerPanel() {
	const p = usePlanner();
	const source = useCalendarDragSource();
	const [view, setView] = useState<View>(loadView);
	const [dialog, setDialog] = useState<{
		date: string;
		time?: string;
		kind?: "task" | "event";
	} | null>(null);
	const [editPath, setEditPath] = useState<string | null>(null);
	// The "Reflect" toast after closing a task opens the task's details here.
	const reflecting =
		p.reflectPath !== null && p.selected?.path === p.reflectPath;
	const detailsPath = editPath ?? (reflecting ? p.reflectPath : null);
	const calendarHere = !p.calendarInTitleBar && p.calendarDock === "planner";
	const pick = (value: string | null) => {
		const next: View = value === "log" ? "log" : "tasks";
		setView(next);
		try {
			localStorage.setItem(VIEW_KEY, next);
		} catch {
			/* Not remembering is fine. */
		}
	};
	return (
		<section className="planner-side planner-stack" aria-label="Planner">
			<div className="planner-side-bar">
				{calendarHere && (
					<div className="planner-cal-tools">
						<span
							className="planner-grip"
							role="img"
							aria-label="Drag the calendar"
							title="Drag to move the calendar"
							{...source}
						>
							<GripVertical aria-hidden="true" />
						</span>
						<CalendarOptions />
					</div>
				)}
				<Button
					variant="ghost"
					size="icon"
					className="planner-wide"
					aria-label="Open the wide planner"
					title="Open the wide planner"
					onClick={p.openScreen}
				>
					<Maximize2 />
				</Button>
			</div>
			<PlannerHomeZone />
			{p.notice && (
				<p role="alert" className="plan-error">
					{p.notice}
				</p>
			)}
			{calendarHere && <CalendarPanel bare hideEvents={view === "tasks"} />}
			<div className="planner-switch-row">
				<SegmentedInput
					label="Planner view"
					options={VIEWS}
					value={view}
					clearable={false}
					onChange={pick}
				/>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							aria-label="Add a task or event"
							disabled={!p.writable}
						>
							<Plus />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuItem
							onSelect={() => setDialog({ date: "", kind: "task" })}
						>
							New task
						</DropdownMenuItem>
						<DropdownMenuItem
							onSelect={() =>
								setDialog({ date: p.date || p.today, kind: "event" })
							}
						>
							New event
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
			{view === "log" ? (
				<DailyLog
					date={p.date}
					today={p.today}
					writable={p.writable}
					load={p.loadDay}
					version={p.version}
					onDate={p.setDate}
					onAddEntry={p.addEntry}
					onAddSection={p.addSection}
					checkIns={{ config: p.checkInConfig, save: p.saveCheckIn }}
					onOpen={(day) => p.openNote(logPath(day))}
					linkTargets={p.linkTargets}
					onOpenLink={p.openLink}
				/>
			) : (
				<>
					<DayEvents
						tasks={p.tasks}
						date={p.date}
						selected={p.selectedPath}
						onSelect={(t) => {
							p.select(t);
							setEditPath(t.path);
						}}
					/>
					<TaskList
						tasks={p.tasks}
						today={p.today}
						selected={p.selectedPath}
						writable={p.writable}
						onSelect={(t) => {
							p.select(t);
							setEditPath(t.path);
						}}
						onToggle={p.toggleFromList}
						onQuickAdd={(title, due) => p.create({ title, kind: "task", due })}
					/>
				</>
			)}
			{dialog && (
				<NewItemDialog
					key={`${dialog.kind}${dialog.date}${dialog.time ?? ""}`}
					open
					kind={dialog.kind}
					defaults={{ ...dialog, today: p.today }}
					onClose={() => setDialog(null)}
					onCreate={p.create}
				/>
			)}
			{detailsPath && (
				<TaskDetailsDialog
					path={detailsPath}
					onClose={() => {
						setEditPath(null);
						if (reflecting) p.reflectStarted();
					}}
				/>
			)}
		</section>
	);
}
