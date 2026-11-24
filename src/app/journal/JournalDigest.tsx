import { CheckCircle2, FileText } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { loadNote } from "../../core/notes/repository";
import { addDaysToKey, startOfWeekKey } from "../../core/planner/dates";
import {
	type DayScales,
	type DigestNote,
	dayScales,
	daySummary,
	fillPrompt,
	journalPrompts,
	weekReview,
} from "../../core/planner/digest";
import { dayOfLogPath } from "../../core/planner/log";
import type { PlannerTask } from "../../core/planner/rules";
import type { Host } from "../../host/host";
import { fmtLong } from "../planner/fmt";
import { promptTemplate, weekStartsOnValue } from "../settings";
import { useSetting } from "../useSetting";

/** The notes saved and tasks finished on a journal day; nothing when there are none. */
export function TodaySoFar(props: {
	day: string;
	notes: readonly DigestNote[];
	tasks: readonly PlannerTask[];
	onOpen: (path: string) => void;
}) {
	const on = useSetting("planner.journal.today");
	if (!on) return null;
	const { edited, done } = daySummary(props.day, props.notes, props.tasks);
	if (edited.length === 0 && done.length === 0) return null;
	return (
		<section
			aria-label="Today, so far"
			className="journal-digest mx-auto max-w-[var(--editor-width)]"
		>
			{done.length > 0 && (
				<p>
					<CheckCircle2 aria-hidden="true" />
					<span className="journal-digest-label">Done</span>
					{done.map((t) => (
						<Button
							key={t.path}
							variant="link"
							size="sm"
							onClick={() => props.onOpen(t.path)}
						>
							{t.title}
						</Button>
					))}
				</p>
			)}
			{edited.length > 0 && (
				<p>
					<FileText aria-hidden="true" />
					<span className="journal-digest-label">Saved</span>
					{edited.slice(0, 8).map((n) => (
						<Button
							key={n.path}
							variant="link"
							size="sm"
							onClick={() => props.onOpen(n.path)}
						>
							{n.title}
						</Button>
					))}
					{edited.length > 8 && <span>and {edited.length - 8} more</span>}
				</p>
			)}
		</section>
	);
}

/**
 * Check-in averages for the journal pages of the last two weeks, read from
 * disk (read only). Read again when one of those pages is saved.
 */
function useDayScales(
	host: Host,
	notes: readonly DigestNote[],
	today: string,
): ReadonlyMap<string, DayScales> {
	const from = addDaysToKey(today, -20);
	const pages = notes.flatMap((n) => {
		const day = dayOfLogPath(n.path);
		return day && day >= from && day <= today
			? [{ day, path: n.path, at: n.updatedAt ?? 0 }]
			: [];
	});
	const key = pages.map((p) => `${p.path}@${p.at}`).join("|");
	const [scales, setScales] = useState<ReadonlyMap<string, DayScales>>(
		new Map(),
	);
	// biome-ignore lint/correctness/useExhaustiveDependencies: `key` stands for the pages and their save times.
	useEffect(() => {
		let live = true;
		void Promise.all(
			pages.map(async (p) => {
				try {
					const { note } = await loadNote(host, p.path);
					return note ? ([p.day, dayScales(note)] as const) : null;
				} catch {
					return null;
				}
			}),
		).then((rows) => {
			if (!live) return;
			setScales(new Map(rows.filter((r) => r !== null)));
		});
		return () => {
			live = false;
		};
	}, [host, key]);
	return scales;
}

const fmtScale = (n: number) => (Math.round(n * 10) / 10).toString();

/** Beside the journal: the week in numbers, and prompts drawn from the data. */
export function JournalInsights(props: {
	host: Host;
	today: string;
	notes: readonly DigestNote[];
	tasks: readonly PlannerTask[];
}) {
	const showWeek = useSetting("planner.journal.weeklyReview");
	const showPrompts = useSetting("planner.journal.prompts");
	const weekStart = weekStartsOnValue(useSetting("planner.weekStartsOn"));
	// Redraw when the wording changes.
	useSetting("planner.journal.prompt.dip");
	useSetting("planner.journal.prompt.stale");
	useSetting("planner.journal.prompt.overdue");
	useSetting("planner.journal.prompt.streak");
	const scales = useDayScales(props.host, props.notes, props.today);
	if (!showWeek && !showPrompts) return null;
	const week = weekReview(
		startOfWeekKey(props.today, weekStart),
		props.notes,
		props.tasks,
		scales,
	);
	const prompts = showPrompts
		? journalPrompts({
				today: props.today,
				notes: props.notes,
				tasks: props.tasks,
				scales,
			})
		: [];
	return (
		<>
			{prompts.length > 0 && (
				<section aria-label="Noticed" className="journal-insight mt-4">
					<h2>Noticed</h2>
					<ul>
						{prompts.map((p) => (
							<li key={`${p.kind}:${Object.values(p.values).join(",")}`}>
								{fillPrompt(promptTemplate(p.kind), p.values)}
							</li>
						))}
					</ul>
				</section>
			)}
			{showWeek && (
				<section aria-label="This week" className="journal-insight mt-4">
					<h2>This week</h2>
					<p className="journal-insight-range">
						{fmtLong(week.from)} to {fmtLong(week.to)}
					</p>
					<dl>
						<dt>Tasks done</dt>
						<dd>{week.tasksDone}</dd>
						<dt>Notes saved</dt>
						<dd>{week.notesEdited}</dd>
						<dt>Days written</dt>
						<dd>{week.daysWritten}</dd>
						{week.scales.map((s) => (
							<FragmentRow key={s.field} label={s.label}>
								{fmtScale(s.avg)} / 5
								{s.before !== undefined && (
									<span className="journal-insight-before">
										{" "}
										(last week {fmtScale(s.before)})
									</span>
								)}
							</FragmentRow>
						))}
					</dl>
				</section>
			)}
		</>
	);
}

function FragmentRow(props: { label: string; children: React.ReactNode }) {
	return (
		<>
			<dt>{props.label}</dt>
			<dd>{props.children}</dd>
		</>
	);
}
