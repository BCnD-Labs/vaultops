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
import { Field } from "./Field";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export interface NewItem {
	title: string;
	kind: "task" | "event";
	due?: string;
	time?: string;
	durationMinutes?: number;
}

/** Task or event, with a title and a day. Events need a day. */
export function NewItemDialog({
	open,
	defaults,
	onClose,
	onCreate,
}: {
	open: boolean;
	defaults: { date: string; time?: string };
	onClose: () => void;
	onCreate: (item: NewItem) => Promise<void>;
}) {
	const [kind, setKind] = useState<"task" | "event">("task");
	const [title, setTitle] = useState("");
	const [date, setDate] = useState(defaults.date);
	const [time, setTime] = useState(defaults.time ?? "");
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const canCreate = title.trim() !== "" && (kind === "task" || date !== "");
	const submit = async () => {
		if (!canCreate || busy) return;
		setBusy(true);
		setError(null);
		try {
			await onCreate({
				title: title.trim(),
				kind,
				due: date || undefined,
				time: time || undefined,
				durationMinutes: kind === "event" && time ? 60 : undefined,
			});
			setTitle("");
			onClose();
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setBusy(false);
		}
	};
	return (
		<Dialog open={open} onOpenChange={(o) => !o && onClose()}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>New {kind}</DialogTitle>
				</DialogHeader>
				<form
					className="plan-dialog"
					onSubmit={(e) => {
						e.preventDefault();
						void submit();
					}}
				>
					<Tabs
						value={kind}
						onValueChange={(v) => setKind(v as "task" | "event")}
					>
						<TabsList aria-label="Kind">
							<TabsTrigger value="task">Task</TabsTrigger>
							<TabsTrigger value="event">Event</TabsTrigger>
						</TabsList>
					</Tabs>
					<Field label="Title">
						{(id) => (
							<Input
								id={id}
								autoFocus
								value={title}
								onChange={(e) => setTitle(e.target.value)}
							/>
						)}
					</Field>
					<div className="plan-fields">
						<Field label={kind === "event" ? "Date" : "Due date"}>
							{(id) => (
								<Input
									id={id}
									type="date"
									value={date}
									onChange={(e) => setDate(e.target.value)}
								/>
							)}
						</Field>
						<Field label={kind === "event" ? "Start time" : "Due time"}>
							{(id) => (
								<Input
									id={id}
									type="time"
									disabled={!date}
									value={time}
									onChange={(e) => setTime(e.target.value)}
								/>
							)}
						</Field>
					</div>
					{error && (
						<p role="alert" className="plan-error">
							{error}
						</p>
					)}
					<DialogFooter>
						<Button type="button" variant="ghost" onClick={onClose}>
							Cancel
						</Button>
						<Button type="submit" disabled={!canCreate || busy}>
							Create {kind}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
