import { Plus } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { keyOfDate } from "../../core/planner/dates";
import { dayOfLogPath, logPath } from "../../core/planner/log";
import type { PlannerTask } from "../../core/planner/rules";
import { nextNumber, type TaskPatch } from "../../core/planner/task-note";
import type { Host } from "../../host/host";
import type { NoteRow } from "../session";
import {
	appendLogEntry,
	appendLogSection,
	createTask,
	loadLog,
	updateTask,
} from "./actions";
import { CalendarView } from "./CalendarView";
import { DailyLog } from "./DailyLog";
import { type NewItem, NewItemDialog } from "./NewItemDialog";
import { TaskInspector } from "./TaskInspector";
import { TaskList } from "./TaskList";
import "./planner.css";

type PlannerTab = "tasks" | "calendar" | "log";

/**
 * Tasks, calendar and daily log. A task is a note with properties (see
 * core/planner/task-note), so everything here reads the vault's note list and
 * writes through the vault host; `onChanged` reloads the list afterwards.
 */
export function PlannerScreen({
	notes,
	host,
	writable,
	onChanged,
	onOpenNote,
}: {
	notes: NoteRow[];
	host: Host;
	writable: boolean;
	/** Reload the vault; `paths` are the notes the planner just wrote. */
	onChanged: (paths: string[]) => Promise<void>;
	onOpenNote: (path: string) => void;
}) {
	const today = keyOfDate(new Date());
	const [tab, setTab] = useState<PlannerTab>("tasks");
	const [date, setDate] = useState(today);
	const [selectedPath, setSelectedPath] = useState<string | null>(null);
	const [dialog, setDialog] = useState<{ date: string; time?: string } | null>(
		null,
	);
	const [notice, setNotice] = useState<string | null>(null);
	const [version, setVersion] = useState(0);
	const tasks = useMemo(
		() => notes.flatMap((n) => (n.task ? [n.task] : [])),
		[notes],
	);
	const loggedDays = useMemo(() => {
		const days = new Set<string>();
		for (const n of notes) {
			const day = dayOfLogPath(n.path);
			if (day && n.preview.trim() !== "") days.add(day);
		}
		return days;
	}, [notes]);
	const selected = tasks.find((t) => t.path === selectedPath) ?? null;

	const run = useCallback(
		async (work: () => Promise<string | undefined>) => {
			setNotice(null);
			try {
				const path = await work();
				await onChanged(path ? [path] : []);
				setVersion((v) => v + 1);
				return path;
			} catch (e) {
				setNotice(e instanceof Error ? e.message : String(e));
				throw e;
			}
		},
		[onChanged],
	);
	const patch = (t: PlannerTask, p: TaskPatch) =>
		run(async () => {
			await updateTask(host, t.path, { ...p, now: new Date() });
			return t.path;
		}).then(
			() => {},
			() => {},
		);
	const create = async (item: NewItem & { number?: number }) => {
		const path = await run(() =>
			createTask(host, {
				title: item.title,
				kind: item.kind,
				number: nextNumber(tasks),
				due: item.due,
				dueTime: item.kind === "task" ? item.time : undefined,
				scheduledDate: item.kind === "event" ? item.due : undefined,
				scheduledTime: item.kind === "event" ? item.time : undefined,
				durationMinutes: item.durationMinutes,
				now: new Date(),
			}),
		);
		if (path) setSelectedPath(path);
	};
	const select = (t: PlannerTask) => setSelectedPath(t.path);
	const loadDay = useCallback((day: string) => loadLog(host, day), [host]);
	const inspector = (
		<TaskInspector
			task={selected}
			writable={writable}
			onPatch={patch}
			onOpen={onOpenNote}
		/>
	);

	return (
		<section className="planner" aria-label="Planner">
			<Tabs
				value={tab}
				onValueChange={(v) => setTab(v as PlannerTab)}
				className="planner-tabs"
			>
				<div className="planner-top">
					<h2>Planner</h2>
					<TabsList aria-label="Planner views">
						<TabsTrigger value="tasks">Tasks</TabsTrigger>
						<TabsTrigger value="calendar">Calendar</TabsTrigger>
						<TabsTrigger value="log">Log</TabsTrigger>
					</TabsList>
					<Button
						size="sm"
						disabled={!writable}
						onClick={() => setDialog({ date: tab === "tasks" ? "" : date })}
					>
						<Plus /> New
					</Button>
				</div>
				{notice && (
					<p role="alert" className="plan-error">
						{notice}
					</p>
				)}
				<TabsContent value="tasks" className="planner-split">
					<TaskList
						tasks={tasks}
						today={today}
						selected={selectedPath}
						writable={writable}
						onSelect={select}
						onToggle={(t) =>
							patch(t, { status: t.status === "open" ? "closed" : "open" })
						}
						onQuickAdd={(title, due) => create({ title, kind: "task", due })}
					/>
					{inspector}
				</TabsContent>
				<TabsContent value="calendar" className="planner-split">
					<CalendarView
						date={date}
						today={today}
						tasks={tasks}
						loggedDays={loggedDays}
						selected={selectedPath}
						writable={writable}
						onDate={setDate}
						onSelect={select}
						onAdd={(d, time) => setDialog({ date: d, time })}
					/>
					{inspector}
				</TabsContent>
				<TabsContent value="log" className="planner-split is-single">
					<DailyLog
						date={date}
						today={today}
						writable={writable}
						load={loadDay}
						version={version}
						onDate={setDate}
						onAddEntry={async (day, section, text) => {
							await run(() => appendLogEntry(host, day, section, text));
						}}
						onAddSection={async (day, name) => {
							await run(() => appendLogSection(host, day, name));
						}}
						onOpen={(day) => onOpenNote(logPath(day))}
					/>
				</TabsContent>
			</Tabs>
			{dialog && (
				<NewItemDialog
					key={`${dialog.date}${dialog.time ?? ""}`}
					open
					defaults={dialog}
					onClose={() => setDialog(null)}
					onCreate={create}
				/>
			)}
		</section>
	);
}
