import { describe, expect, it } from "vitest";
import { parseNote, serializeNote } from "../note-format";
import {
	addMonthsToKey,
	daysBetween,
	monthGrid,
	startOfWeekKey,
	validDateKey,
	weekDays,
} from "./dates";
import {
	addEntry,
	addSection,
	dayOfLogPath,
	logPath,
	newLogNote,
	readLog,
} from "./log";
import {
	chipOverflow,
	compareTasks,
	groupOf,
	isDeadlineOn,
	type PlannerTask,
	parseDateInput,
	parseQuickAdd,
	startTimeOn,
	taskGroups,
	taskRows,
	timedLanes,
} from "./rules";
import { newTaskNote, nextNumber, patchTask, taskFromNote } from "./task-note";

const T = "2026-11-05"; // a Thursday
const task = (o: Partial<PlannerTask> & { number: number }): PlannerTask => ({
	path: `Planner/t${o.number}.vnote`,
	title: `Task ${o.number}`,
	status: "open",
	kind: "task",
	starred: false,
	labels: [],
	preview: "",
	...o,
});

describe("dates", () => {
	it("validates and does arithmetic", () => {
		expect(validDateKey("2026-02-30")).toBe(false);
		expect(daysBetween("2026-11-06", T)).toBe(1);
		expect(addMonthsToKey("2026-01-31", 1)).toBe("2026-02-28");
		expect(startOfWeekKey(T, 0)).toBe("2026-11-01");
		expect(startOfWeekKey(T, 1)).toBe("2026-11-02");
		expect(weekDays(T)).toHaveLength(7);
	});
	it("month grids are whole weeks, four to six", () => {
		const g = monthGrid(T);
		expect(g.length % 7).toBe(0);
		expect(g.length).toBeGreaterThanOrEqual(28);
		expect(g).toContain("2026-11-30");
		expect(monthGrid("2026-02-15", 0)).toHaveLength(28);
	});
});

describe("task rules", () => {
	it("groups by distance from today", () => {
		expect(groupOf(task({ number: 1 }), T)).toBe("No date");
		expect(groupOf(task({ number: 1, due: "2026-11-04" }), T)).toBe("Overdue");
		expect(groupOf(task({ number: 1, due: T }), T)).toBe("Today");
		expect(groupOf(task({ number: 1, due: "2026-11-06" }), T)).toBe("Tomorrow");
		expect(groupOf(task({ number: 1, due: "2026-11-12" }), T)).toBe(
			"Next 7 days",
		);
		expect(groupOf(task({ number: 1, due: "2026-11-13" }), T)).toBe("Later");
	});
	it("sorts dated first, starred first in a day, done newest first", () => {
		const a = task({ number: 1, due: "2026-11-07" });
		const b = task({ number: 2, due: "2026-11-07", starred: true });
		const c = task({ number: 3 });
		const d1 = task({
			number: 4,
			status: "closed",
			closedAt: "2026-11-01T00:00:00Z",
		});
		const d2 = task({
			number: 5,
			status: "closed",
			closedAt: "2026-11-02T00:00:00Z",
		});
		expect([a, c, d1, b, d2].sort(compareTasks).map((t) => t.number)).toEqual([
			2, 1, 3, 5, 4,
		]);
	});
	it("tabs, search, #number, starred and lingering", () => {
		const tasks = [
			task({ number: 1, due: "2026-11-03" }),
			task({ number: 2, due: T, starred: true, labels: ["home"] }),
			task({ number: 3, due: "2026-11-09" }),
			task({ number: 4 }),
			task({ number: 5, status: "closed" }),
			task({ number: 6, kind: "event", due: T }),
		];
		const nums = (o: Parameters<typeof taskRows>[1]) =>
			taskRows(tasks, o).map((t) => t.number);
		expect(nums({ tab: "today", today: T })).toEqual([1, 2]);
		expect(nums({ tab: "next", today: T })).toEqual([3]);
		expect(nums({ tab: "all", today: T })).toEqual([1, 2, 3, 4]);
		expect(nums({ tab: "done", today: T })).toEqual([5]);
		expect(nums({ tab: "all", today: T, query: "#3" })).toEqual([3]);
		expect(nums({ tab: "all", today: T, query: "HOME" })).toEqual([2]);
		expect(nums({ tab: "all", today: T, starredOnly: true })).toEqual([2]);
		expect(
			nums({
				tab: "today",
				today: T,
				lingering: new Set([tasks[4]?.path as string]),
			}),
		).toEqual([1, 2, 5]);
		const g = taskGroups(taskRows(tasks, { tab: "today", today: T }), {
			tab: "today",
			today: T,
		});
		expect(g.map((x) => x.name)).toEqual(["Overdue", "Today"]);
	});
	it("quick-add reads a trailing date word", () => {
		expect(parseQuickAdd("Buy milk tomorrow", T)).toEqual({
			title: "Buy milk",
			due: "2026-11-06",
		});
		expect(parseQuickAdd("Call fri", T)).toEqual({
			title: "Call",
			due: "2026-11-06",
		});
		expect(parseQuickAdd("Call thu", T)).toEqual({ title: "Call", due: T });
		expect(parseQuickAdd("Call mon", T)).toEqual({
			title: "Call",
			due: "2026-11-09",
		});
		expect(parseQuickAdd("Water plants", T)).toEqual({ title: "Water plants" });
		expect(parseQuickAdd("today", T)).toEqual({ title: "today" });
	});
	it("parses typed natural-language dates and ISO dates", () => {
		expect(parseDateInput("2026-11-15", T)).toBe("2026-11-15");
		expect(parseDateInput("today", T)).toBe(T);
		expect(parseDateInput("tomorrow", T)).toBe("2026-11-06");
		expect(parseDateInput("fri", T)).toBe("2026-11-06");
		expect(parseDateInput("next thu", T)).toBe("2026-11-12");
		expect(parseDateInput("+3d", T)).toBe("2026-11-08");
		expect(parseDateInput("in 2 weeks", T)).toBe("2026-11-19");
		expect(parseDateInput("notadate", T)).toBeUndefined();
		expect(parseDateInput("   ", T)).toBeUndefined();
	});
});

describe("calendar helpers", () => {
	it("shows a start time only when real; end-of-day due is a deadline", () => {
		const timed = task({ number: 1, due: T, dueTime: "09:30" });
		const eod = task({ number: 2, due: T, dueTime: "23:59" });
		const sched = task({
			number: 3,
			due: "2026-11-20",
			scheduledDate: T,
			scheduledTime: "23:59",
		});
		expect(startTimeOn(timed, T)).toBe("09:30");
		expect(startTimeOn(eod, T)).toBeUndefined();
		expect(isDeadlineOn(eod, T)).toBe(true);
		expect(startTimeOn(sched, T)).toBe("23:59");
		expect(isDeadlineOn(timed, T)).toBe(false);
	});
	it("overflow keeps two chips and counts the rest", () => {
		expect(chipOverflow([1, 2, 3])).toEqual({ shown: [1, 2, 3], more: 0 });
		expect(chipOverflow([1, 2, 3, 4, 5])).toEqual({ shown: [1, 2], more: 3 });
	});
	it("overlapping timed items share lanes", () => {
		const a = task({
			number: 1,
			due: T,
			dueTime: "09:00",
			durationMinutes: 60,
		});
		const b = task({
			number: 2,
			due: T,
			dueTime: "09:30",
			durationMinutes: 30,
		});
		const c = task({ number: 3, due: T, dueTime: "11:00" });
		const lanes = timedLanes([c, b, a], T);
		const by = (n: number) => lanes.find((l) => l.task.number === n);
		expect(by(1)).toMatchObject({ lane: 0, lanes: 2 });
		expect(by(2)).toMatchObject({ lane: 1, lanes: 2 });
		expect(by(3)).toMatchObject({ lane: 0, lanes: 1 });
	});
});

describe("task notes", () => {
	const now = new Date("2026-11-05T10:00:00Z");
	const make = () => {
		const initial = newTaskNote({
			title: "Pay rent",
			number: 7,
			due: "2026-11-10",
			labels: ["home"],
			starred: true,
			now,
		});
		return {
			header: { ...initial.header, noteId: "n", title: "Pay rent" },
			blocks: initial.blocks ?? [],
		} as never as import("../note-format").Note;
	};
	it("round-trips through the file format as plain properties", () => {
		const note = make();
		const parsed = parseNote(serializeNote(note));
		expect(parsed.problems).toEqual([]);
		const t = taskFromNote("Planner/Pay rent.vnote", parsed.note as never);
		expect(t).toMatchObject({
			number: 7,
			title: "Pay rent",
			status: "open",
			kind: "task",
			due: "2026-11-10",
			starred: true,
			labels: ["home"],
		});
	});
	it("ordinary notes are not tasks", () => {
		const note = make();
		const { props: _p, ...header } = note.header as Record<string, unknown>;
		expect(taskFromNote("a.vnote", { ...note, header } as never)).toBeNull();
	});
	it("closing and reopening stamps and clears Closed, leaving other props alone", () => {
		const note = make();
		const closed = patchTask(note, { status: "closed", now });
		expect(taskFromNote("p", closed)).toMatchObject({
			status: "closed",
			closedAt: now.toISOString(),
			labels: ["home"],
			number: 7,
		});
		const reopened = patchTask(closed, { status: "open" });
		expect(taskFromNote("p", reopened)?.closedAt).toBeUndefined();
		expect(patchTask(note, { due: null, starred: false })).not.toBe(note);
		const cleared = taskFromNote(
			"p",
			patchTask(note, { due: null, starred: false }),
		);
		expect(cleared).toMatchObject({ due: undefined, starred: false });
	});
	it("keeps properties it does not know", () => {
		const note = make();
		const props = {
			...(note.header.props as object),
			Extra: { type: "weird", value: [1] },
		};
		const patched = patchTask(
			{ ...note, header: { ...note.header, props } } as never,
			{ starred: false },
		);
		expect((patched.header.props as Record<string, unknown>).Extra).toEqual({
			type: "weird",
			value: [1],
		});
	});
	it("numbers continue from the highest", () => {
		expect(nextNumber([])).toBe(1);
		expect(nextNumber([{ number: 3 }, { number: 9 }, { number: 0 }])).toBe(10);
	});
	it("round-trips and patches priority, recurrence and title", () => {
		const initial = newTaskNote({
			title: "Review PR",
			number: 8,
			priority: "high",
			recurrence: "weekly",
			now,
		});
		const note = {
			header: { ...initial.header, noteId: "n8", title: "Review PR" },
			blocks: initial.blocks ?? [],
		} as never as import("../note-format").Note;
		expect(taskFromNote("Planner/Review PR.vnote", note)).toMatchObject({
			title: "Review PR",
			priority: "high",
			recurrence: "weekly",
		});
		const updated = patchTask(note, {
			title: "Ship PR",
			priority: null,
			recurrence: "daily",
		});
		expect(taskFromNote("Planner/Review PR.vnote", updated)).toMatchObject({
			title: "Ship PR",
			priority: undefined,
			recurrence: "daily",
		});
	});
});

describe("daily log", () => {
	it("paths round-trip", () => {
		expect(dayOfLogPath(logPath(T))).toBe(T);
		expect(dayOfLogPath("Journal/notes.vnote")).toBeNull();
		expect(dayOfLogPath("Other/2026-11-05.vnote")).toBeNull();
	});
	it("entries append to the main log or a named section; at most three sections", () => {
		let note = {
			header: { ...newLogNote(T).header, noteId: "l" },
			blocks: [],
		} as never as import("../note-format").Note;
		note = addEntry(note, null, "Shipped the thing");
		note = addSection(note, "Evening") as typeof note;
		const evening = readLog(note)[1]?.id as string;
		note = addEntry(note, evening, "Read a bit");
		note = addEntry(note, null, "Second main entry");
		const log = readLog(note);
		expect(log.map((s) => [s.name, s.entries.map((e) => e.text)])).toEqual([
			["Log", ["Shipped the thing", "Second main entry"]],
			["Evening", ["Read a bit"]],
		]);
		expect(addEntry(note, null, "   ")).toBe(note);
		note = addSection(note, "B") as typeof note;
		note = addSection(note, "C") as typeof note;
		expect(addSection(note, "D")).toBeNull();
		expect(addSection(note, " ")).toBeNull();
		expect(parseNote(serializeNote(note)).problems).toEqual([]);
	});
});
