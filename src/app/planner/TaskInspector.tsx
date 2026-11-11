import { ExternalLink, Pencil, Star } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { ReflectionDraft } from "../../core/planner/reflection";
import type { PlannerTask } from "../../core/planner/rules";
import type { TaskPatch } from "../../core/planner/task-note";
import { Field } from "./Field";
import { fmtLong } from "./fmt";
import { NewItemDialog } from "./NewItemDialog";
import { ReflectionSection } from "./ReflectionSection";
import { Labels } from "./TaskList";

const DURATIONS = [15, 30, 45, 60, 90, 120, 180, 240];

/** The selected task: status, star, dates and schedule. The description is the note itself. */
export function TaskInspector({
	task,
	writable,
	onPatch,
	onOpen,
	onLoadReflection,
	onSaveReflection,
	openReflection = false,
	onReflectionOpened,
}: {
	task: PlannerTask | null;
	writable: boolean;
	onPatch: (t: PlannerTask, p: TaskPatch) => Promise<void>;
	onOpen: (path: string) => void;
	onLoadReflection?: (t: PlannerTask) => Promise<ReflectionDraft>;
	onSaveReflection?: (t: PlannerTask, d: ReflectionDraft) => Promise<void>;
	/** Open the reflection editor now (set for this task by the "Reflect" toast). */
	openReflection?: boolean;
	onReflectionOpened?: () => void;
}) {
	const [editing, setEditing] = useState(false);
	if (!task) {
		return (
			<aside
				className="plan-card plan-inspector is-empty"
				aria-label="Selected task"
			>
				<p className="plan-empty">
					Select a task or calendar item to see its details.
				</p>
			</aside>
		);
	}
	const isEvent = task.kind === "event";
	const done = task.status === "closed";
	return (
		<aside className="plan-card plan-inspector" aria-label="Selected task">
			<header className="plan-card-head">
				<h2>
					{task.number > 0 && <span className="plan-num">#{task.number}</span>}{" "}
					{task.title}
				</h2>
				<div className="plan-actions">
					<Button
						variant="ghost"
						size="icon"
						aria-label={`Edit ${task.kind}`}
						disabled={!writable}
						onClick={() => setEditing(true)}
					>
						<Pencil />
					</Button>
					<Button
						variant="ghost"
						size="icon"
						aria-label={task.starred ? "Unstar" : "Star"}
						aria-pressed={task.starred}
						disabled={!writable}
						onClick={() => void onPatch(task, { starred: !task.starred })}
					>
						<Star className={cn(task.starred && "plan-star-on")} />
					</Button>
				</div>
			</header>
			<div className="plan-inspector-body">
				{!isEvent && (
					<div className="plan-check">
						<Checkbox
							id="plan-status"
							checked={done}
							disabled={!writable}
							onCheckedChange={() =>
								void onPatch(task, { status: done ? "open" : "closed" })
							}
						/>
						<label
							htmlFor="plan-status"
							className={cn(done && "plan-done-text")}
						>
							{done
								? `Closed${task.closedAt ? ` ${new Date(task.closedAt).toLocaleString()}` : ""}`
								: "Open · mark closed"}
						</label>
					</div>
				)}
				{done && !isEvent && onLoadReflection && onSaveReflection && (
					<ReflectionSection
						key={task.path}
						reflectedAt={task.reflectedAt}
						writable={writable}
						load={() => onLoadReflection(task)}
						save={(d) => onSaveReflection(task, d)}
						startOpen={openReflection}
						onStarted={onReflectionOpened}
					/>
				)}
				{task.labels.length > 0 && (
					<div className="plan-labels">
						<Labels labels={task.labels} />
					</div>
				)}
				<div className="plan-fields">
					<Field label="Due date">
						{(id) => (
							<Input
								id={id}
								type="date"
								disabled={!writable}
								value={task.due ?? ""}
								onChange={(e) =>
									void onPatch(task, {
										due: e.target.value || null,
										dueTime: e.target.value ? undefined : null,
									})
								}
							/>
						)}
					</Field>
					<Field label="Due time">
						{(id) => (
							<Input
								id={id}
								type="time"
								disabled={!writable || !task.due}
								value={task.dueTime ?? ""}
								onChange={(e) =>
									void onPatch(task, { dueTime: e.target.value || null })
								}
							/>
						)}
					</Field>
				</div>
				<fieldset className="plan-fields plan-schedule">
					<legend>Calendar schedule</legend>
					<p>Plan time here without changing the deadline.</p>
					<Field label="Planned date">
						{(id) => (
							<Input
								id={id}
								type="date"
								disabled={!writable}
								value={task.scheduledDate ?? ""}
								onChange={(e) =>
									void onPatch(task, {
										scheduledDate: e.target.value || null,
										scheduledTime: e.target.value ? undefined : null,
									})
								}
							/>
						)}
					</Field>
					<Field label="Start time">
						{(id) => (
							<Input
								id={id}
								type="time"
								disabled={!writable || !task.scheduledDate}
								value={task.scheduledTime ?? ""}
								onChange={(e) =>
									void onPatch(task, { scheduledTime: e.target.value || null })
								}
							/>
						)}
					</Field>
					<Field label="Duration">
						{(id) => (
							<select
								id={id}
								disabled={!writable}
								value={task.durationMinutes ?? ""}
								onChange={(e) =>
									void onPatch(task, {
										durationMinutes: e.target.value
											? Number(e.target.value)
											: null,
									})
								}
							>
								<option value="">No duration</option>
								{DURATIONS.map((m) => (
									<option key={m} value={m}>
										{m < 60 ? `${m} min` : `${m / 60} h`}
									</option>
								))}
							</select>
						)}
					</Field>
					{task.scheduledDate && (
						<Button
							variant="ghost"
							size="sm"
							disabled={!writable}
							onClick={() =>
								void onPatch(task, {
									scheduledDate: null,
									scheduledTime: null,
									durationMinutes: null,
								})
							}
						>
							Clear separate schedule
						</Button>
					)}
				</fieldset>
				{task.preview && <p className="plan-preview">{task.preview}</p>}
				{task.due && <p className="plan-meta">Due {fmtLong(task.due)}</p>}
				<Button variant="secondary" size="sm" onClick={() => onOpen(task.path)}>
					<ExternalLink /> Open note
				</Button>
			</div>
			{editing && (
				<NewItemDialog
					key={task.path}
					open
					task={task}
					defaults={{ date: task.due ?? "" }}
					onClose={() => setEditing(false)}
					onCreate={async () => {}}
					onSave={(patch) => onPatch(task, patch)}
				/>
			)}
		</aside>
	);
}
