import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { keyOfDate, validDateKey } from "../../core/planner/dates";
import {
	type PlannerTask,
	parseDateInput,
	type TaskPriority,
} from "../../core/planner/rules";
import type { TaskPatch } from "../../core/planner/task-note";
import { Field } from "./Field";
import { fmtDay } from "./fmt";

export interface NewItem {
	title: string;
	kind: "task" | "event";
	due?: string;
	time?: string;
	scheduledDate?: string;
	scheduledTime?: string;
	durationMinutes?: number;
	priority?: Exclude<TaskPriority, "none">;
	recurrence?: string;
}

const PRIORITIES: [TaskPriority, string][] = [
	["none", "None"],
	["low", "Low"],
	["medium", "Medium"],
	["high", "High"],
];

const RECURRENCES: [string, string][] = [
	["", "Does not repeat"],
	["daily", "Every day"],
	["weekdays", "Every weekday"],
	["weekly", "Every week"],
	["monthly", "Every month"],
	["yearly", "Every year"],
];

function DateTimeRow(p: {
	dateLabel: string;
	timeLabel: string;
	previewId: string;
	date: string;
	parsed?: string;
	invalid: boolean;
	time: string;
	onDate: (v: string) => void;
	onTime: (v: string) => void;
}) {
	const raw = p.date.trim();
	const preview = !raw
		? "No date"
		: !p.parsed
			? "Invalid date"
			: raw === p.parsed
				? fmtDay(p.parsed)
				: `${fmtDay(p.parsed)} · ${p.parsed}`;
	return (
		<div className="plan-date-row">
			<Field label={p.dateLabel}>
				{(id) => (
					<div className="plan-date-input-wrap">
						<Input
							id={id}
							type="text"
							placeholder="YYYY-MM-DD, tomorrow, fri"
							aria-invalid={p.invalid || undefined}
							value={p.date}
							onChange={(e) => p.onDate(e.target.value)}
						/>
						<span
							className={cn("plan-date-preview", p.invalid && "is-invalid")}
							data-testid={p.previewId}
						>
							{preview}
						</span>
					</div>
				)}
			</Field>
			<Field label={p.timeLabel}>
				{(id) => (
					<Input
						id={id}
						type="time"
						disabled={!p.parsed}
						value={p.time}
						onChange={(e) => p.onTime(e.target.value)}
					/>
				)}
			</Field>
		</div>
	);
}

/** Create or edit a planner task or event with natural-language dates. */
export function NewItemDialog({
	open,
	defaults,
	task,
	onClose,
	onCreate,
	onSave,
}: {
	open: boolean;
	defaults: { date: string; time?: string; today?: string };
	task?: PlannerTask;
	onClose: () => void;
	onCreate: (item: NewItem) => Promise<void>;
	onSave?: (patch: TaskPatch) => Promise<void>;
}) {
	const today =
		defaults.today ??
		(validDateKey(defaults.date) ? defaults.date : keyOfDate(new Date()));
	const isTask = (task?.kind ?? "task") === "task";
	const [kind, setKind] = useState<"task" | "event">(task?.kind ?? "task");
	const [title, setTitle] = useState(task?.title ?? "");
	const [priority, setPriority] = useState<TaskPriority>(
		task?.priority ?? "none",
	);
	const [dueInput, setDueInput] = useState(
		task
			? ((isTask ? task.due : (task.scheduledDate ?? task.due)) ?? "")
			: defaults.date,
	);
	const [time, setTime] = useState(
		task
			? ((isTask ? task.dueTime : task.scheduledTime) ?? "")
			: (defaults.time ?? ""),
	);
	const [scheduledInput, setScheduledInput] = useState(
		task && isTask ? (task.scheduledDate ?? "") : "",
	);
	const [scheduledTime, setScheduledTime] = useState(
		task && isTask ? (task.scheduledTime ?? "") : "",
	);
	const [recurrence, setRecurrence] = useState(task?.recurrence ?? "");
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	const parsedDue = parseDateInput(dueInput, today);
	const dueInvalid = dueInput.trim() !== "" && !parsedDue;
	const parsedSched = parseDateInput(scheduledInput, today);
	const schedInvalid =
		kind === "task" && scheduledInput.trim() !== "" && !parsedSched;
	const canSubmit =
		title.trim() !== "" &&
		!dueInvalid &&
		!schedInvalid &&
		(kind === "task" || !!parsedDue);

	const submit = async () => {
		if (!canSubmit || busy) return;
		setBusy(true);
		setError(null);
		try {
			const cleanTitle = title.trim();
			const cleanTime = parsedDue && time ? time : undefined;
			if (task && onSave) {
				await onSave({
					title: cleanTitle,
					priority: priority === "none" ? null : priority,
					recurrence: recurrence || null,
					due: parsedDue ?? null,
					dueTime: kind === "task" ? (cleanTime ?? null) : null,
					scheduledDate: (kind === "event" ? parsedDue : parsedSched) ?? null,
					scheduledTime:
						(kind === "event"
							? cleanTime
							: parsedSched && scheduledTime
								? scheduledTime
								: undefined) ?? null,
					durationMinutes:
						kind === "event" && cleanTime
							? (task.durationMinutes ?? 60)
							: undefined,
				});
			} else {
				const item: NewItem = {
					title: cleanTitle,
					kind,
					due: parsedDue,
					time: cleanTime,
					durationMinutes: kind === "event" && cleanTime ? 60 : undefined,
				};
				if (kind === "task" && parsedSched) {
					item.scheduledDate = parsedSched;
					if (scheduledTime) item.scheduledTime = scheduledTime;
				}
				if (priority !== "none") item.priority = priority;
				if (recurrence) item.recurrence = recurrence;
				await onCreate(item);
				setTitle("");
			}
			onClose();
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setBusy(false);
		}
	};

	const customRecurrence =
		recurrence && !RECURRENCES.some(([v]) => v === recurrence);

	return (
		<Dialog open={open} onOpenChange={(o) => !o && onClose()}>
			<DialogContent className="plan-dialog-content">
				<DialogHeader className="plan-dialog-head">
					<DialogTitle>{task ? `Edit ${kind}` : `New ${kind}`}</DialogTitle>
					{!task && (
						<Tabs
							value={kind}
							onValueChange={(v) => setKind(v as "task" | "event")}
						>
							<TabsList aria-label="Kind">
								<TabsTrigger value="task">Task</TabsTrigger>
								<TabsTrigger value="event">Event</TabsTrigger>
							</TabsList>
						</Tabs>
					)}
				</DialogHeader>
				<form
					className="plan-dialog"
					onSubmit={(e) => {
						e.preventDefault();
						void submit();
					}}
				>
					<Field label="Description">
						{(id) => (
							<Input
								id={id}
								autoFocus
								placeholder={
									kind === "event" ? "Event title" : "What needs to be done?"
								}
								value={title}
								onChange={(e) => setTitle(e.target.value)}
							/>
						)}
					</Field>
					<fieldset className="plan-priority-group">
						<legend className="plan-field-label">Priority</legend>
						<div className="plan-priority-radios">
							{PRIORITIES.map(([val, label]) => (
								<label
									key={val}
									className={cn(
										"plan-priority-pill",
										priority === val && "is-selected",
									)}
									data-priority={val}
								>
									<input
										type="radio"
										className="sr-only"
										name="priority"
										value={val}
										checked={priority === val}
										onChange={() => setPriority(val)}
									/>
									{label}
								</label>
							))}
						</div>
					</fieldset>
					<div className="plan-date-section">
						<DateTimeRow
							dateLabel={kind === "event" ? "Date" : "Due date"}
							timeLabel={kind === "event" ? "Start time" : "Due time"}
							previewId="due-preview"
							date={dueInput}
							parsed={parsedDue}
							invalid={dueInvalid}
							time={time}
							onDate={setDueInput}
							onTime={setTime}
						/>
						{kind === "task" && (
							<DateTimeRow
								dateLabel="Scheduled"
								timeLabel="Start time"
								previewId="scheduled-preview"
								date={scheduledInput}
								parsed={parsedSched}
								invalid={schedInvalid}
								time={scheduledTime}
								onDate={setScheduledInput}
								onTime={setScheduledTime}
							/>
						)}
					</div>
					<Field label="Recurrence">
						{(id) => (
							<select
								id={id}
								value={recurrence}
								onChange={(e) => setRecurrence(e.target.value)}
							>
								{RECURRENCES.map(([val, label]) => (
									<option key={val} value={val}>
										{label}
									</option>
								))}
								{customRecurrence && (
									<option value={recurrence}>{recurrence}</option>
								)}
							</select>
						)}
					</Field>
					{error && (
						<p role="alert" className="plan-error">
							{error}
						</p>
					)}
					<DialogFooter>
						<Button type="button" variant="ghost" onClick={onClose}>
							Cancel
						</Button>
						<Button type="submit" disabled={!canSubmit || busy}>
							{task ? `Save ${kind}` : `Create ${kind}`}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
