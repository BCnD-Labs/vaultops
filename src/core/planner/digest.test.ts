import { describe, expect, it } from "vitest";
import type { Note } from "../note-format";
import { applyCheckIn } from "./check-in";
import {
	type DayScales,
	type DigestNote,
	dayScales,
	daySummary,
	fillPrompt,
	journalPrompts,
	weekReview,
} from "./digest";
import { logPath } from "./log";
import type { PlannerTask } from "./rules";

// Local noon, so the day is the same whatever the machine's time zone.
const at = (day: string) => new Date(`${day}T12:00:00`).getTime();
const iso = (day: string) => new Date(at(day)).toISOString();

const note = (path: string, day: string, tags: string[] = []): DigestNote => ({
	path,
	title: path,
	updatedAt: at(day),
	tags,
});

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

describe("daySummary", () => {
	it("lists notes saved that day (not journal pages or tasks) and tasks closed", () => {
		const notes = [
			note("a.vnote", "2026-11-20"),
			note("b.vnote", "2026-11-19"),
			note(logPath("2026-11-20"), "2026-11-20"),
			{ ...note("t.vnote", "2026-11-20"), task: {} },
		];
		const tasks = [
			task({ number: 1, status: "closed", closedAt: iso("2026-11-20") }),
			task({ number: 2, status: "closed", closedAt: iso("2026-11-19") }),
		];
		const s = daySummary("2026-11-20", notes, tasks);
		expect(s.edited.map((n) => n.path)).toEqual(["a.vnote"]);
		expect(s.done.map((t) => t.number)).toEqual([1]);
	});
});

describe("dayScales", () => {
	it("averages each scale over the check-ins filled in", () => {
		let n: Note = {
			header: { format: "vaultops-note", v: 1, noteId: "d" },
			blocks: [],
		};
		n = applyCheckIn(n, "morning", {
			scales: { energy: 4, mood: 3 },
			note: "",
		});
		n = applyCheckIn(n, "evening", { scales: { energy: 2 }, note: "" });
		expect(dayScales(n)).toEqual({ energy: 3, mood: 3 });
	});
});

describe("weekReview", () => {
	it("counts the week and compares scales with the week before", () => {
		const notes = [
			note("a.vnote", "2026-11-16"),
			note("b.vnote", "2026-11-22"),
			note("c.vnote", "2026-11-23"),
			note(logPath("2026-11-17"), "2026-11-17"),
		];
		const tasks = [
			task({ number: 1, status: "closed", closedAt: iso("2026-11-18") }),
			task({ number: 2, status: "closed", closedAt: iso("2026-11-10") }),
		];
		const scales = new Map<string, DayScales>([
			["2026-11-16", { energy: 4 }],
			["2026-11-18", { energy: 2 }],
			["2026-11-10", { energy: 5 }],
		]);
		expect(weekReview("2026-11-16", notes, tasks, scales)).toEqual({
			from: "2026-11-16",
			to: "2026-11-22",
			tasksDone: 1,
			notesEdited: 2,
			daysWritten: 1,
			scales: [{ field: "energy", label: "Energy", avg: 3, before: 5 }],
		});
	});
});

describe("journalPrompts", () => {
	const today = "2026-11-24";
	const kinds = (input: Partial<Parameters<typeof journalPrompts>[0]>) =>
		journalPrompts({
			today,
			notes: [],
			tasks: [],
			scales: new Map(),
			...input,
		});

	it("notices a scale dipping three days running, but not with a gap", () => {
		const scales = new Map<string, DayScales>([
			["2026-11-21", { mood: 5 }],
			["2026-11-22", { mood: 4 }],
			["2026-11-23", { mood: 2 }],
		]);
		expect(kinds({ scales })).toEqual([
			{ kind: "dip", values: { field: "mood", count: "3" } },
		]);
		scales.delete("2026-11-22");
		expect(kinds({ scales })).toEqual([]);
	});

	it("counts overdue tasks", () => {
		const tasks = [
			task({ number: 1, due: "2026-11-20" }),
			task({ number: 2, due: "2026-11-30" }),
			task({ number: 3, due: "2026-11-01", status: "closed" }),
		];
		expect(kinds({ tasks })).toEqual([
			{ kind: "overdue", values: { count: "1" } },
		]);
	});

	it("names a tag on 3+ notes that hasn't been touched in a while", () => {
		const notes = [
			note("1.vnote", "2026-11-01", ["ADD-103"]),
			note("2.vnote", "2026-11-05", ["add-103"]),
			note("3.vnote", "2026-11-10", ["ADD-103"]),
			note("4.vnote", "2026-11-23", ["fresh"]),
		];
		expect(kinds({ notes })).toEqual([
			{ kind: "stale", values: { tag: "ADD-103", days: "14" } },
		]);
	});

	it("celebrates a journaling streak ending today or yesterday", () => {
		const notes = ["2026-11-21", "2026-11-22", "2026-11-23"].map((d) =>
			note(logPath(d), d),
		);
		expect(kinds({ notes })).toEqual([
			{ kind: "streak", values: { count: "3" } },
		]);
	});
});

describe("fillPrompt", () => {
	it("fills known names and leaves unknown ones as typed", () => {
		expect(fillPrompt("{count} days of {what}", { count: "3" })).toBe(
			"3 days of {what}",
		);
	});
});
