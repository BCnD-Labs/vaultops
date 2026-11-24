import { useEffect, useLayoutEffect, useReducer, useState } from "react";
import { Button } from "@/components/ui/button";
import { useInViewport } from "@/components/ui/use-in-viewport";
import { keyOfDate } from "../../core/planner/dates";
import type { DigestNote } from "../../core/planner/digest";
import { dayOfLogPath, logPath } from "../../core/planner/log";
import type { PlannerTask } from "../../core/planner/rules";
import type { DocumentDrop } from "../../editor/block-drag";
import { openNote } from "../../editor/note-io";
import type { LinkSource } from "../../editor/note-link";
import type { Host } from "../../host/host";
import { SharedNoteEditor } from "../CanvasEmbed";
import type { LiveDocuments } from "../live-documents";
import { NotePreview } from "../NoteView";
import { fmtLong } from "../planner/fmt";
import { MiniCalendar } from "../planner/MiniCalendar";
import { usePlanner } from "../planner/PlannerContext";
import type { VaultView } from "../session";
import { JournalInsights, TodaySoFar } from "./JournalDigest";

export interface JournalOptions {
	documents: LiveDocuments;
	host: Host;
	links?: LinkSource;
	onDropBlock?: DocumentDrop;
}

function JournalDay({
	day,
	today,
	duplicate,
	digest,
	...options
}: JournalOptions & {
	day: string;
	today: string;
	duplicate: boolean;
	locked: boolean;
	digest: {
		notes: readonly DigestNote[];
		tasks: readonly PlannerTask[];
		onOpen: (path: string) => void;
	};
}) {
	const { documents, host, links, locked, onDropBlock } = options;
	// Any listed day may be one picked on the calendar that has no file yet;
	// it is created on the first edit, like today.
	const allowMissing = true;
	const path = logPath(day);
	const { ref, visible: near } = useInViewport("400px 0px");
	const [focused, setFocused] = useState(false);
	const [activate, setActivate] = useState(false);
	const [binding, setBinding] =
		useState<ReturnType<LiveDocuments["subscribe"]>>();
	const [error, setError] = useState("");
	const [, redraw] = useReducer((n: number) => n + 1, 0);
	const [rekey, reopen] = useReducer((n: number) => n + 1, 0);
	const visible = near || focused;
	// biome-ignore lint/correctness/useExhaustiveDependencies: A move leaves the day at its original path.
	useEffect(() => {
		if (!visible) return;
		setError("");
		const sub = documents.subscribe(
			{ path },
			(doc) => {
				if (doc.path === path) redraw();
				else reopen();
			},
			() => openNote(host, path, undefined, { duplicate, allowMissing }),
		);
		setBinding(sub);
		void sub.ready.then(redraw, (reason: unknown) => setError(String(reason)));
		return sub.unsubscribe;
	}, [documents, host, path, visible, duplicate, allowMissing, rekey]);

	const current = binding?.current();
	const doc = visible && current?.path === path ? current : null;
	const opened = doc?.opened;
	const editable =
		!!opened?.editable && !doc?.readOnly && !duplicate && !locked;
	const owner = doc?.editorOwner;
	const editing = !!doc && binding?.ownsEditor();
	useLayoutEffect(() => {
		if (editable && owner === null) binding?.setEditorOwner(true);
	}, [binding, editable, owner]);
	const notice =
		doc?.saveStatus.kind === "failed"
			? doc.saveStatus.reason
			: error || opened?.notice;
	return (
		<section
			ref={ref}
			id={`journal-day-${day}`}
			className="journal-day border-b border-border px-4 py-3"
			aria-label={fmtLong(day)}
			onFocus={() => setFocused(true)}
			onBlur={(event) =>
				setFocused(event.currentTarget.contains(event.relatedTarget))
			}
		>
			<h2 className="mx-auto max-w-[var(--editor-width)] font-semibold">
				<time dateTime={day}>{fmtLong(day)}</time>
			</h2>
			<TodaySoFar day={day} {...digest} />
			{notice && (
				<p role="status" className="notice">
					{notice}
				</p>
			)}
			{binding &&
				opened &&
				(editing ? (
					<SharedNoteEditor
						{...{ host, links, binding, opened }}
						readOnly={!editable}
						focusOnAttach={activate}
						onDropBlock={
							doc?.noteId && onDropBlock
								? onDropBlock.bind(null, doc.noteId)
								: undefined
						}
					/>
				) : (
					<NotePreview
						doc={doc?.editorDraft?.doc ?? opened.doc}
						onResumeEditing={
							editable
								? () => setActivate(binding.setEditorOwner(true, true))
								: undefined
						}
					/>
				))}
		</section>
	);
}

/** The app's Reduce motion setting or the system's. */
function reduceMotion(): boolean {
	return (
		document.documentElement.hasAttribute("data-reduce-motion") ||
		window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
	);
}

export function JournalSpace({
	view,
	locked,
	...options
}: JournalOptions & { view: VaultView; locked: boolean }) {
	const { today, tasks, loggedDays, openNote: openFloating } = usePlanner();
	const [selected, setSelected] = useState(today);
	const activity = new Set([
		...loggedDays,
		...view.notes.flatMap((note) =>
			note.updatedAt ? [keyOfDate(new Date(note.updatedAt))] : [],
		),
	]);
	const memories = view.notes.filter((note) => {
		const day =
			dayOfLogPath(note.path) ||
			(note.updatedAt ? keyOfDate(new Date(note.updatedAt)) : "");
		return (
			day.slice(5) === selected.slice(5) &&
			day.slice(0, 4) < selected.slice(0, 4)
		);
	});
	const older = view.notes.flatMap(({ path, kind }) => {
		const day = kind !== "canvas" && dayOfLogPath(path);
		return day && day !== today ? [day] : [];
	});
	const duplicates = new Set(
		view.report
			.filter((entry) => entry.duplicateOf.length)
			.map((entry) => entry.path),
	);
	return (
		<div className="flex min-h-0 flex-1">
			<section
				className="min-h-0 flex-1 overflow-auto p-3"
				aria-label="Journal"
			>
				{[...new Set([today, selected, ...older])]
					.sort()
					.reverse()
					.map((day) => (
						<JournalDay
							key={day}
							{...options}
							day={day}
							today={today}
							duplicate={duplicates.has(logPath(day))}
							locked={locked || !view.writable}
							digest={{ notes: view.notes, tasks, onOpen: openFloating }}
						/>
					))}
			</section>
			<aside
				className="hidden w-72 shrink-0 overflow-auto border-l p-3 min-[900px]:block"
				aria-label="Journal calendar"
			>
				<MiniCalendar
					date={selected}
					today={today}
					tasks={tasks}
					loggedDays={activity}
					onDate={(day) => {
						setSelected(day);
						requestAnimationFrame(() =>
							document.getElementById(`journal-day-${day}`)?.scrollIntoView({
								behavior: reduceMotion() ? "instant" : "smooth",
							}),
						);
					}}
				/>
				<JournalInsights
					host={options.host}
					today={today}
					notes={view.notes}
					tasks={tasks}
				/>
				{memories.length > 0 && (
					<section aria-label="On this day" className="mt-4">
						<h2 className="mb-1 font-semibold text-muted-foreground text-xs">
							On this day
						</h2>
						<ul className="flex flex-col gap-0.5">
							{memories.map((note) => (
								<li key={note.path}>
									<Button
										variant="ghost"
										size="sm"
										className="w-full justify-start truncate"
										onClick={() => openFloating(note.path)}
									>
										{note.title}
									</Button>
								</li>
							))}
						</ul>
					</section>
				)}
			</aside>
		</div>
	);
}
