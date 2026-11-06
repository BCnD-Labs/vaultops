import { Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { logPath } from "../../core/planner/log";
import { CalendarView } from "./CalendarView";
import { DailyLog } from "./DailyLog";
import { NewItemDialog } from "./NewItemDialog";
import { usePlanner } from "./PlannerContext";
import { TaskInspector } from "./TaskInspector";
import { TaskList } from "./TaskList";
import "./planner.css";

type PlannerTab = "tasks" | "calendar" | "log";

/** The wide planner: Tasks, Calendar (day / week / month) and Log, with the selected task beside them. */
export function PlannerScreen() {
	const p = usePlanner();
	const [tab, setTab] = useState<PlannerTab>("tasks");
	const [dialog, setDialog] = useState<{ date: string; time?: string } | null>(
		null,
	);
	const inspector = (
		<TaskInspector
			task={p.selected}
			writable={p.writable}
			onPatch={p.patch}
			onOpen={p.openNote}
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
						disabled={!p.writable}
						onClick={() => setDialog({ date: tab === "tasks" ? "" : p.date })}
					>
						<Plus /> New
					</Button>
				</div>
				{p.notice && (
					<p role="alert" className="plan-error">
						{p.notice}
					</p>
				)}
				<TabsContent value="tasks" className="planner-split">
					<TaskList
						tasks={p.tasks}
						today={p.today}
						selected={p.selectedPath}
						writable={p.writable}
						onSelect={p.select}
						onToggle={(t) =>
							p.patch(t, { status: t.status === "open" ? "closed" : "open" })
						}
						onQuickAdd={(title, due) => p.create({ title, kind: "task", due })}
					/>
					{inspector}
				</TabsContent>
				<TabsContent value="calendar" className="planner-split">
					<CalendarView
						date={p.date}
						today={p.today}
						tasks={p.tasks}
						loggedDays={p.loggedDays}
						selected={p.selectedPath}
						writable={p.writable}
						onDate={p.setDate}
						onSelect={p.select}
						onAdd={(d, time) => setDialog({ date: d, time })}
					/>
					{inspector}
				</TabsContent>
				<TabsContent value="log" className="planner-split is-single">
					<DailyLog
						date={p.date}
						today={p.today}
						writable={p.writable}
						load={p.loadDay}
						version={p.version}
						onDate={p.setDate}
						onAddEntry={p.addEntry}
						onAddSection={p.addSection}
						onOpen={(day) => p.openNote(logPath(day))}
					/>
				</TabsContent>
			</Tabs>
			{dialog && (
				<NewItemDialog
					key={`${dialog.date}${dialog.time ?? ""}`}
					open
					defaults={dialog}
					onClose={() => setDialog(null)}
					onCreate={p.create}
				/>
			)}
		</section>
	);
}
