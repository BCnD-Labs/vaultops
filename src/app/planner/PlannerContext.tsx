import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useMemo,
	useState,
} from "react";
import type { LinkRef, LinkTarget } from "../../core/links/links";
import type { Note } from "../../core/note-format";
import {
	type CheckInConfig,
	type CheckInDraft,
	type CheckInSlot,
	DEFAULT_CHECK_IN_CONFIG,
} from "../../core/planner/check-in";
import { keyOfDate } from "../../core/planner/dates";
import { dayOfLogPath } from "../../core/planner/log";
import { type RecentEntry, recentEntries } from "../../core/planner/log-rules";
import type { ReflectionDraft } from "../../core/planner/reflection";
import type { PlannerTask } from "../../core/planner/rules";
import { nextNumber, type TaskPatch } from "../../core/planner/task-note";
import type { Host } from "../../host/host";
import { notify } from "../../ui/notify";
import type { NoteRow } from "../session";
import { checkInConfig, settings } from "../settings";
import { useSetting } from "../useSetting";
import {
	appendLogEntry,
	appendLogSection,
	createTask,
	loadLog,
	loadReflection,
	saveCheckIn,
	saveReflection,
	updateTask,
} from "./actions";
import type { NewItem } from "./NewItemDialog";

export interface PlannerApi {
	today: string;
	date: string;
	setDate: (d: string) => void;
	tasks: PlannerTask[];
	loggedDays: ReadonlySet<string>;
	/** The latest days with something written, newest first. */
	recentLogs: RecentEntry[];
	/** Notes and tasks a log entry can link to. */
	linkTargets: LinkTarget[];
	/** Open what a log entry's link points at. */
	openLink: (link: LinkRef) => void;
	selectedPath: string | null;
	selected: PlannerTask | null;
	select: (t: PlannerTask) => void;
	writable: boolean;
	notice: string | null;
	/** Changes after every planner write, so a log reads again. */
	version: number;
	create: (item: NewItem) => Promise<void>;
	patch: (t: PlannerTask, p: TaskPatch) => Promise<void>;
	/** A closed task's reflection: read it, and save it (an unchanged draft writes nothing). */
	loadReflection: (t: PlannerTask) => Promise<ReflectionDraft>;
	saveReflection: (t: PlannerTask, d: ReflectionDraft) => Promise<void>;
	addEntry: (
		day: string,
		section: string | null,
		text: string,
		links?: LinkRef[],
	) => Promise<void>;
	addSection: (day: string, name: string) => Promise<void>;
	/** The daily check-in settings, and saving one slot into the day's log. */
	checkInConfig: CheckInConfig;
	saveCheckIn: (
		day: string,
		slot: CheckInSlot,
		draft: CheckInDraft,
	) => Promise<void>;
	loadDay: (day: string) => Promise<Note | null>;
	openNote: (path: string) => void;
	/** Show the planner on the wide screen. */
	openScreen: () => void;
	/** True: the calendar lives in the title bar. False: it lives in a sidebar. */
	calendarInTitleBar: boolean;
	setCalendarInTitleBar: (v: boolean) => void;
	/** Where the sidebar calendar sits: inside the planner, or on its own below
	 *  the right sidebar's tools. */
	calendarDock: CalendarDock;
	setCalendarDock: (v: CalendarDock) => void;
	/** Close or reopen a task from the task list. Closing offers "Reflect" in a toast. */
	toggleFromList: (t: PlannerTask) => Promise<void>;
	/** Set when the toast's Reflect was chosen: the task whose reflection editor should open. */
	reflectPath: string | null;
	/** The inspector took the request; clear it. */
	reflectStarted: () => void;
}

export type CalendarDock = "planner" | "right";

const noop = async () => {};
const IDLE: PlannerApi = {
	today: "1970-01-01",
	date: "1970-01-01",
	setDate: () => {},
	tasks: [],
	loggedDays: new Set(),
	recentLogs: [],
	linkTargets: [],
	openLink: () => {},
	selectedPath: null,
	selected: null,
	select: () => {},
	writable: false,
	notice: null,
	version: 0,
	create: noop,
	patch: noop,
	loadReflection: async () => ({ items: {}, notes: "" }),
	saveReflection: noop,
	addEntry: noop,
	addSection: noop,
	checkInConfig: DEFAULT_CHECK_IN_CONFIG,
	saveCheckIn: noop,
	loadDay: async () => null,
	openNote: () => {},
	openScreen: () => {},
	calendarInTitleBar: false,
	setCalendarInTitleBar: () => {},
	calendarDock: "planner",
	setCalendarDock: () => {},
	toggleFromList: async () => {},
	reflectPath: null,
	reflectStarted: () => {},
};

const PlannerCtx = createContext<PlannerApi>(IDLE);
export const usePlanner = () => useContext(PlannerCtx);

/**
 * The planner's state, shared by the title-bar calendar, the right sidebar and
 * the wide screen: the chosen day, the tasks read from the vault's notes, and
 * the writes. A task is a note, so every write goes through the vault host and
 * then `onChanged` reloads the note list.
 */
export function PlannerProvider({
	notes,
	host,
	writable,
	onChanged,
	onOpenNote,
	onOpenScreen,
	children,
}: {
	notes: NoteRow[];
	host: Host;
	writable: boolean;
	onChanged: (paths: string[]) => Promise<void>;
	onOpenNote: (path: string) => void;
	onOpenScreen: () => void;
	children: ReactNode;
}) {
	const today = keyOfDate(new Date());
	const [date, setDate] = useState(today);
	const [selectedPath, setSelectedPath] = useState<string | null>(null);
	const [notice, setNotice] = useState<string | null>(null);
	const [version, setVersion] = useState(0);
	const [reflectPath, setReflectPath] = useState<string | null>(null);
	// Both calendar choices live in the settings registry (old keys, old shape).
	const calendarInTitleBar =
		useSetting("appearance.calendarPlacement") === "titlebar";
	const calendarDock: CalendarDock =
		useSetting("appearance.calendarDock") === "right" ? "right" : "planner";
	const checkInCfg = checkInConfig({
		"planner.checkIn.morning": useSetting("planner.checkIn.morning"),
		"planner.checkIn.morningStart": useSetting("planner.checkIn.morningStart"),
		"planner.checkIn.afternoon": useSetting("planner.checkIn.afternoon"),
		"planner.checkIn.afternoonStart": useSetting(
			"planner.checkIn.afternoonStart",
		),
		"planner.checkIn.evening": useSetting("planner.checkIn.evening"),
		"planner.checkIn.eveningStart": useSetting("planner.checkIn.eveningStart"),
	});
	const tasks = useMemo(
		() => notes.flatMap((n) => (n.task ? [n.task] : [])),
		[notes],
	);
	const loggedDays = useMemo(() => {
		const days = new Set<string>();
		for (const n of notes) {
			const day = dayOfLogPath(n.path);
			if (day && n.preview.trim() !== "") days.add(day);
		}
		return days;
	}, [notes]);

	const recentLogs = useMemo(() => recentEntries(notes, today), [notes, today]);
	const linkTargets = useMemo(
		() =>
			notes.flatMap((n): LinkTarget[] =>
				n.id && n.kind !== "canvas" && !dayOfLogPath(n.path)
					? [
							{
								kind: "note",
								target: n.id,
								label: n.title,
								hint: n.task ? "Task" : undefined,
							},
						]
					: [],
			),
		[notes],
	);

	const run = useCallback(
		async (work: () => Promise<string | undefined>) => {
			setNotice(null);
			try {
				const path = await work();
				await onChanged(path ? [path] : []);
				setVersion((v) => v + 1);
				return path;
			} catch (e) {
				setNotice(e instanceof Error ? e.message : String(e));
				throw e;
			}
		},
		[onChanged],
	);
	const api: PlannerApi = {
		today,
		date,
		setDate,
		tasks,
		loggedDays,
		recentLogs,
		linkTargets,
		openLink: (link) => {
			const row = notes.find((n) => n.id === link.target);
			if (row) onOpenNote(row.path);
		},
		selectedPath,
		selected: tasks.find((t) => t.path === selectedPath) ?? null,
		select: (t) => {
			setSelectedPath(t.path);
			setReflectPath(null);
		},
		writable,
		notice,
		version,
		patch: (t, p) =>
			run(async () => {
				await updateTask(host, t.path, { ...p, now: new Date() });
				return t.path;
			}).then(
				() => {},
				() => {},
			),
		loadReflection: (t) => loadReflection(host, t.path),
		saveReflection: async (t, d) => {
			await run(async () => {
				await saveReflection(host, t.path, d, new Date());
				return t.path;
			});
		},
		create: async (item) => {
			const path = await run(() =>
				createTask(host, {
					title: item.title,
					kind: item.kind,
					number: nextNumber(tasks),
					priority: item.priority,
					recurrence: item.recurrence,
					due: item.due,
					dueTime: item.kind === "task" ? item.time : undefined,
					scheduledDate: item.kind === "event" ? item.due : item.scheduledDate,
					scheduledTime: item.kind === "event" ? item.time : item.scheduledTime,
					durationMinutes: item.durationMinutes,
					now: new Date(),
				}),
			);
			if (path) setSelectedPath(path);
		},
		addEntry: async (day, section, text, links) => {
			await run(() => appendLogEntry(host, day, section, text, links));
		},
		addSection: async (day, name) => {
			await run(() => appendLogSection(host, day, name));
		},
		checkInConfig: checkInCfg,
		saveCheckIn: async (day, slot, draft) => {
			await run(() => saveCheckIn(host, day, slot, draft));
		},
		loadDay: (day) => loadLog(host, day),
		openNote: onOpenNote,
		openScreen: onOpenScreen,
		calendarInTitleBar,
		setCalendarInTitleBar: (v) => {
			settings.set("appearance.calendarPlacement", v ? "titlebar" : "sidebar");
		},
		calendarDock,
		setCalendarDock: (v) => {
			settings.set("appearance.calendarDock", v);
		},
		toggleFromList: async (t) => {
			const closing = t.status === "open";
			let failed = false;
			await run(async () => {
				await updateTask(host, t.path, {
					status: closing ? "closed" : "open",
					now: new Date(),
				});
				return t.path;
			}).catch(() => {
				failed = true;
			});
			if (failed || !closing || t.kind === "event") return;
			notify("Task closed", {
				action: {
					label: "Reflect",
					onClick: () => {
						setSelectedPath(t.path);
						setReflectPath(t.path);
					},
				},
			});
		},
		reflectPath,
		reflectStarted: () => setReflectPath(null),
	};
	return <PlannerCtx.Provider value={api}>{children}</PlannerCtx.Provider>;
}
