import {
	type ComponentProps,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { useNearViewport } from "@/components/ui/use-near-viewport";
import { serializeNote } from "../../core/note-format";
import { createNote } from "../../core/notes/repository";
import { dayOfLogPath, logPath, newLogNote } from "../../core/planner/log";
import { JOURNAL_FOLDER } from "../../core/planner/task-note";
import { buildRecoveryText } from "../../core/session/recovery";
import { docToBlocks } from "../../editor/doc-blocks";
import { NoteEditor } from "../../editor/NoteEditor";
import { type OpenedNote, openNote } from "../../editor/note-io";
import { type Draft, saveDraft } from "../../editor/save-draft";
import { useAutosave } from "../../editor/useAutosave";
import type { Host } from "../../host/host";
import { fmtLong } from "../planner/fmt";
import { usePlanner } from "../planner/PlannerContext";
import type { VaultView } from "../session";
import "./journal.css";

type EditorOptions = Pick<
	ComponentProps<typeof NoteEditor>,
	"links" | "featureOn"
>;

export type JournalDrafts = Map<
	string,
	Pick<ReturnType<typeof useAutosave>, "flush" | "peek">
>;

export async function flushJournal(drafts: JournalDrafts) {
	return (
		await Promise.all([...drafts.values()].map((save) => save.flush()))
	).every(Boolean);
}

export function journalRecovery(drafts: JournalDrafts, now: Date) {
	return [...drafts].flatMap(([path, save]) => {
		const doc = save.peek()?.doc;
		return doc ? [buildRecoveryText({ path, title: path, doc, now })] : [];
	});
}

export interface JournalOptions extends EditorOptions {
	host: Host;
	drafts: JournalDrafts;
	onSaved: (paths: string[]) => Promise<void>;
}

async function saveDay(
	host: Host,
	opened: OpenedNote,
	{ title: day, doc }: Draft,
) {
	if (opened.note) return saveDraft(host, opened, { doc });
	await host.makeFolder(JOURNAL_FOLDER);
	const initial = { ...newLogNote(day), blocks: docToBlocks(doc) };
	const { path, note } = await createNote(
		host,
		JOURNAL_FOLDER,
		day,
		initial,
		opened.path,
	);
	return {
		ok: true as const,
		path,
		note,
		text: serializeNote(note),
		titleChanged: false,
	};
}

type DayProps = JournalOptions & {
	day: string;
	duplicate: boolean;
	writable: boolean;
	onPending: (day: string, pending: boolean) => void;
};

function DayEditor({
	day,
	duplicate,
	writable,
	host,
	drafts,
	onSaved,
	onPending,
	...editor
}: DayProps) {
	const path = logPath(day);
	const [opened, setOpened] = useState<OpenedNote>();
	const [noteId, setNoteId] = useState<string>();
	const [error, setError] = useState<string>();
	const duplicateAtOpen = useRef(duplicate);
	useEffect(() => {
		let live = true;
		void (async () => {
			const note =
				(await host.kindOf(path)) === null
					? {
							path,
							note: null,
							doc: { type: "doc", content: [{ type: "paragraph" }] },
							editable: true,
							baseText: null,
						}
					: await openNote(host, path, duplicateAtOpen.current);
			if (live) setOpened(note);
		})().catch((reason: unknown) => {
			if (live) setError(String(reason));
		});
		return () => {
			live = false;
		};
	}, [host, path]);

	const { state, change, flush, peek } = useAutosave(
		host,
		opened ?? null,
		(info) => {
			setNoteId(info.noteId);
			void onSaved([path]).catch(() =>
				setError("Saved, but the vault list could not be refreshed."),
			);
		},
		saveDay,
	);
	useEffect(() => {
		drafts.set(path, { flush, peek });
		return () => {
			drafts.delete(path);
		};
	}, [drafts, path, flush, peek]);
	useEffect(
		() => onPending(day, state.kind !== "saved"),
		[onPending, day, state.kind],
	);
	const notice =
		state.kind === "failed" ? state.reason : (error ?? opened?.notice);
	return (
		<>
			{notice && (
				<p role="status" className="notice">
					{notice}
				</p>
			)}
			{opened && (
				<NoteEditor
					{...editor}
					doc={opened.doc}
					noteId={noteId ?? opened.note?.header.noteId}
					editable={opened.editable && writable && !duplicate}
					onChange={(doc) => change({ doc, title: day })}
				/>
			)}
		</>
	);
}

function JournalDay({ pinned, ...props }: DayProps & { pinned: boolean }) {
	const { day } = props;
	const { ref, near } = useNearViewport();
	const [focused, setFocused] = useState(false);
	return (
		<section
			id={`journal-${day}`}
			ref={ref}
			className="journal-day"
			aria-label={fmtLong(day)}
			onFocus={() => setFocused(true)}
			onBlur={(event) => {
				if (!event.currentTarget.contains(event.relatedTarget))
					setFocused(false);
			}}
		>
			<h2>
				<time dateTime={day}>{fmtLong(day)}</time>
			</h2>
			{(near || focused || pinned) && <DayEditor {...props} />}
		</section>
	);
}

export function JournalSpace({
	view,
	locked,
	...options
}: JournalOptions & {
	view: VaultView;
	locked: boolean;
}) {
	const { today } = usePlanner();
	const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
	const onPending = useCallback((day: string, pending: boolean) => {
		setPending((previous) => {
			if (previous.has(day) === pending) return previous;
			const next = new Set(previous);
			if (pending) next.add(day);
			else next.delete(day);
			return next;
		});
	}, []);
	const logs = new Set(
		view.notes.flatMap(({ path, kind }) => {
			const day = kind !== "canvas" && dayOfLogPath(path);
			return day ? [day] : [];
		}),
	);
	const duplicates = new Set(
		view.report
			.filter((entry) => entry.duplicateOf.length)
			.map((entry) => entry.path),
	);
	const days = [
		today,
		...[...new Set([...logs, ...pending])]
			.filter((day) => day !== today)
			.sort()
			.reverse(),
	];
	return (
		<section className="journal-stream" aria-label="Journal">
			{days.map((day) => (
				<JournalDay
					key={day}
					day={day}
					onPending={onPending}
					pinned={pending.has(day)}
					{...options}
					duplicate={duplicates.has(logPath(day))}
					writable={view.writable && !locked}
				/>
			))}
		</section>
	);
}
