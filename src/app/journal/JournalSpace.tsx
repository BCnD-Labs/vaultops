import { useEffect, useLayoutEffect, useReducer, useState } from "react";
import { useInViewport } from "@/components/ui/use-in-viewport";
import { dayOfLogPath, logPath } from "../../core/planner/log";
import { openNote } from "../../editor/note-io";
import type { LinkSource } from "../../editor/note-link";
import type { Host } from "../../host/host";
import { SharedNoteEditor } from "../CanvasEmbed";
import type { LiveDocuments } from "../live-documents";
import { NotePreview } from "../NoteView";
import { fmtLong } from "../planner/fmt";
import { usePlanner } from "../planner/PlannerContext";
import type { VaultView } from "../session";

export interface JournalOptions {
	documents: LiveDocuments;
	host: Host;
	links?: LinkSource;
}

function JournalDay({
	day,
	today,
	duplicate,
	...options
}: JournalOptions & {
	day: string;
	today: string;
	duplicate: boolean;
	locked: boolean;
}) {
	const { documents, host, links, locked } = options;
	const allowMissing = day === today;
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

export function JournalSpace({
	view,
	locked,
	...options
}: JournalOptions & { view: VaultView; locked: boolean }) {
	const { today } = usePlanner();
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
		<section className="min-h-0 flex-1 overflow-auto p-3" aria-label="Journal">
			{[today, ...older.sort().reverse()].map((day) => (
				<JournalDay
					key={day}
					{...options}
					day={day}
					today={today}
					duplicate={duplicates.has(logPath(day))}
					locked={locked || !view.writable}
				/>
			))}
		</section>
	);
}
