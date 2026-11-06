import { Maximize2, Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Agenda } from "./CalendarView";
import { DailyLog } from "./DailyLog";
import { MiniCalendar } from "./MiniCalendar";
import { NewItemDialog } from "./NewItemDialog";
import { usePlanner } from "./PlannerContext";
import { TaskInspector } from "./TaskInspector";
import { TaskList } from "./TaskList";
import "./planner.css";

/** The planner in the right sidebar: a month to pick the day, then Tasks, Day and Log. */
export function PlannerPanel() {
	const p = usePlanner();
	const [tab, setTab] = useState("tasks");
	const [dialog, setDialog] = useState<{ date: string; time?: string } | null>(
		null,
	);
	return (
		<section className="planner-side" aria-label="Planner">
			<div className="planner-side-bar">
				<Button
					size="sm"
					disabled={!p.writable}
					onClick={() => setDialog({ date: tab === "tasks" ? "" : p.date })}
				>
					<Plus /> New
				</Button>
				<Button
					variant="ghost"
					size="icon"
					aria-label="Open the wide planner"
					title="Open the wide planner"
					onClick={p.openScreen}
				>
					<Maximize2 />
				</Button>
			</div>
			<MiniCalendar
				date={p.date}
				today={p.today}
				tasks={p.tasks}
				loggedDays={p.loggedDays}
				onDate={p.setDate}
			/>
			{p.notice && (
				<p role="alert" className="plan-error">
					{p.notice}
				</p>
			)}
			<Tabs value={tab} onValueChange={setTab}>
				<TabsList aria-label="Planner views">
					<TabsTrigger value="tasks">Tasks</TabsTrigger>
					<TabsTrigger value="day">Day</TabsTrigger>
					<TabsTrigger value="log">Log</TabsTrigger>
				</TabsList>
				<TabsContent value="tasks">
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
					{p.selected && (
						<TaskInspector
							task={p.selected}
							writable={p.writable}
							onPatch={p.patch}
							onOpen={p.openNote}
						/>
					)}
				</TabsContent>
				<TabsContent value="day">
					<Agenda
						date={p.date}
						tasks={p.tasks}
						selected={p.selectedPath}
						writable={p.writable}
						onSelect={p.select}
						onAdd={(d) => setDialog({ date: d })}
					/>
					{p.selected && (
						<TaskInspector
							task={p.selected}
							writable={p.writable}
							onPatch={p.patch}
							onOpen={p.openNote}
						/>
					)}
				</TabsContent>
				<TabsContent value="log">
					<DailyLog
						date={p.date}
						today={p.today}
						writable={p.writable}
						load={p.loadDay}
						version={p.version}
						onDate={p.setDate}
						onAddEntry={p.addEntry}
						onAddSection={p.addSection}
						onOpen={(day) => p.openNote(`Journal/${day}.vnote`)}
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

/** The pinned calendar tab: a month and the chosen day's items. */
export function CalendarPanel() {
	const p = usePlanner();
	const [dialog, setDialog] = useState<string | null>(null);
	return (
		<section className="planner-side" aria-label="Calendar">
			<MiniCalendar
				date={p.date}
				today={p.today}
				tasks={p.tasks}
				loggedDays={p.loggedDays}
				onDate={p.setDate}
			/>
			<Agenda
				date={p.date}
				tasks={p.tasks}
				selected={p.selectedPath}
				writable={p.writable}
				onSelect={(t) => {
					p.select(t);
				}}
				onAdd={(d) => setDialog(d)}
			/>
			{dialog !== null && (
				<NewItemDialog
					key={dialog}
					open
					defaults={{ date: dialog }}
					onClose={() => setDialog(null)}
					onCreate={p.create}
				/>
			)}
		</section>
	);
}
