import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useMemo,
	useState,
} from "react";
import type { Note } from "../../core/note-format";
import { keyOfDate } from "../../core/planner/dates";
import { dayOfLogPath } from "../../core/planner/log";
import type { PlannerTask } from "../../core/planner/rules";
import { nextNumber, type TaskPatch } from "../../core/planner/task-note";
import type { Host } from "../../host/host";
import type { NoteRow } from "../session";
import {
	appendLogEntry,
	appendLogSection,
	createTask,
	loadLog,
	updateTask,
} from "./actions";
import type { NewItem } from "./NewItemDialog";

export interface PlannerApi {
	today: string;
	date: string;
	setDate: (d: string) => void;
	tasks: PlannerTask[];
	loggedDays: ReadonlySet<string>;
	selectedPath: string | null;
	selected: PlannerTask | null;
	select: (t: PlannerTask) => void;
	writable: boolean;
	notice: string | null;
	/** Changes after every planner write, so a log reads again. */
	version: number;
	create: (item: NewItem) => Promise<void>;
	patch: (t: PlannerTask, p: TaskPatch) => Promise<void>;
	addEntry: (
		day: string,
		section: string | null,
		text: string,
	) => Promise<void>;
	addSection: (day: string, name: string) => Promise<void>;
	loadDay: (day: string) => Promise<Note | null>;
	openNote: (path: string) => void;
	/** Show the planner on the wide screen. */
	openScreen: () => void;
	/** True: the calendar lives in the title bar. False: it lives in a sidebar. */
	calendarInTitleBar: boolean;
	setCalendarInTitleBar: (v: boolean) => void;
	/** Where the sidebar calendar sits: inside the planner, or on its own below
	 *  the tools of the right or left sidebar. */
	calendarDock: CalendarDock;
	setCalendarDock: (v: CalendarDock) => void;
}

export type CalendarDock = "planner" | "right" | "left";

const noop = async () => {};
const IDLE: PlannerApi = {
	today: "1970-01-01",
	date: "1970-01-01",
	setDate: () => {},
	tasks: [],
	loggedDays: new Set(),
	selectedPath: null,
	selected: null,
	select: () => {},
	writable: false,
	notice: null,
	version: 0,
	create: noop,
	patch: noop,
	addEntry: noop,
	addSection: noop,
	loadDay: async () => null,
	openNote: () => {},
	openScreen: () => {},
	calendarInTitleBar: false,
	setCalendarInTitleBar: () => {},
	calendarDock: "planner",
	setCalendarDock: () => {},
};

const PlannerCtx = createContext<PlannerApi>(IDLE);
export const usePlanner = () => useContext(PlannerCtx);

const flag = (key: string, fallback: boolean) => {
	try {
		const v = localStorage.getItem(key);
		return v === null ? fallback : v === "1";
	} catch {
		return fallback;
	}
};
const saveFlag = (key: string, value: boolean) => {
	try {
		localStorage.setItem(key, value ? "1" : "0");
	} catch {
		/* Not remembering is fine. */
	}
};
const BUTTON_KEY = "vaultops:calendar-button";
const DOCK_KEY = "vaultops:calendar-dock";
const loadDock = (): CalendarDock => {
	try {
		const v = localStorage.getItem(DOCK_KEY);
		return v === "right" || v === "left" ? v : "planner";
	} catch {
		return "planner";
	}
};

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
	const [calendarInTitleBar, setInTitleBar] = useState(() =>
		flag(BUTTON_KEY, true),
	);
	const [calendarDock, setDock] = useState(loadDock);
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
		selectedPath,
		selected: tasks.find((t) => t.path === selectedPath) ?? null,
		select: (t) => setSelectedPath(t.path),
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
		create: async (item) => {
			const path = await run(() =>
				createTask(host, {
					title: item.title,
					kind: item.kind,
					number: nextNumber(tasks),
					due: item.due,
					dueTime: item.kind === "task" ? item.time : undefined,
					scheduledDate: item.kind === "event" ? item.due : undefined,
					scheduledTime: item.kind === "event" ? item.time : undefined,
					durationMinutes: item.durationMinutes,
					now: new Date(),
				}),
			);
			if (path) setSelectedPath(path);
		},
		addEntry: async (day, section, text) => {
			await run(() => appendLogEntry(host, day, section, text));
		},
		addSection: async (day, name) => {
			await run(() => appendLogSection(host, day, name));
		},
		loadDay: (day) => loadLog(host, day),
		openNote: onOpenNote,
		openScreen: onOpenScreen,
		calendarInTitleBar,
		setCalendarInTitleBar: (v) => {
			setInTitleBar(v);
			saveFlag(BUTTON_KEY, v);
		},
		calendarDock,
		setCalendarDock: (v) => {
			setDock(v);
			try {
				localStorage.setItem(DOCK_KEY, v);
			} catch {
				/* Not remembering is fine. */
			}
		},
	};
	return <PlannerCtx.Provider value={api}>{children}</PlannerCtx.Provider>;
}
