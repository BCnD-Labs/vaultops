import { ChevronDown, Maximize2, Plus } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	CalendarMoveMenu,
	PlannerHomeZone,
	useCalendarDragSource,
} from "./CalendarDock";
import { CalendarPanel } from "./CalendarPanel";
import { NewItemDialog } from "./NewItemDialog";
import { usePlanner } from "./PlannerContext";
import { TaskInspector } from "./TaskInspector";
import { TaskList } from "./TaskList";
import "./planner.css";

const OPEN_KEY = "vaultops:planner-open";
function loadOpen(id: string) {
	try {
		return localStorage.getItem(`${OPEN_KEY}:${id}`) !== "0";
	} catch {
		return true;
	}
}

/** One stacked, collapsible part of the planner (Calendar, Tasks). */
function PlannerSection({
	id,
	title,
	actions,
	dragProps,
	children,
}: {
	id: string;
	title: string;
	actions?: ReactNode;
	dragProps?: ReturnType<typeof useCalendarDragSource>;
	children: ReactNode;
}) {
	const [open, setOpen] = useState(() => loadOpen(id));
	const bodyId = `planner-section-${id}`;
	return (
		<section className="planner-section" aria-label={title}>
			<div className="planner-section-head" role="presentation" {...dragProps}>
				<button
					type="button"
					className="planner-section-toggle"
					aria-expanded={open}
					aria-controls={bodyId}
					onClick={() => {
						setOpen(!open);
						try {
							localStorage.setItem(`${OPEN_KEY}:${id}`, open ? "0" : "1");
						} catch {
							/* Not remembering is fine. */
						}
					}}
				>
					<ChevronDown
						className="planner-section-chevron"
						data-open={open || undefined}
						aria-hidden="true"
					/>
					{title}
				</button>
				{actions}
			</div>
			<div id={bodyId} hidden={!open}>
				{children}
			</div>
		</section>
	);
}

/**
 * The planner in the right sidebar, as stacked collapsible sections (VS Code
 * style): Calendar and Tasks. The calendar section can be dragged out of the
 * planner to its own place below a sidebar (see CalendarDock); then the planner
 * is just Tasks and Log. In the title-bar setting there is no calendar section.
 */
export function PlannerPanel() {
	const p = usePlanner();
	const source = useCalendarDragSource();
	const [dialog, setDialog] = useState<{ date: string; time?: string } | null>(
		null,
	);
	const calendarHere = !p.calendarInTitleBar && p.calendarDock === "planner";
	return (
		<section className="planner-side planner-stack" aria-label="Planner">
			<div className="planner-side-bar">
				<Button
					size="sm"
					disabled={!p.writable}
					onClick={() => setDialog({ date: "" })}
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
			<PlannerHomeZone />
			{p.notice && (
				<p role="alert" className="plan-error">
					{p.notice}
				</p>
			)}
			{calendarHere && (
				<PlannerSection
					id="calendar"
					title="Calendar"
					dragProps={source}
					actions={<CalendarMoveMenu />}
				>
					<CalendarPanel bare />
				</PlannerSection>
			)}
			<PlannerSection id="tasks" title="Tasks">
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
			</PlannerSection>
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
