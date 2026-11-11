import { describe, expect, it } from "vitest";
import { type Note, parseNote } from "../../core/note-format";
import { readCheckIn } from "../../core/planner/check-in";
import { readLog } from "../../core/planner/log";
import { taskFromNote } from "../../core/planner/task-note";
import { MemoryHost } from "../../host/memory-host";
import {
	appendLogEntry,
	appendLogSection,
	createTask,
	loadLog,
	saveCheckIn,
	updateTask,
} from "./actions";

const NOW = new Date("2026-11-07T10:00:00Z");
const DAY = "2026-11-07";
const DAY_PATH = "Journal/2026-11-07.vnote";

async function readNote(host: MemoryHost, path: string): Promise<Note> {
	const parsed = parseNote(await host.readText(path));
	if (!parsed.note) throw new Error("note did not parse");
	return parsed.note;
}
const logOf = async (host: MemoryHost) =>
	readLog(await readNote(host, DAY_PATH));

describe("createTask", () => {
	it("creates the Planner folder on first use and writes a task note", async () => {
		const host = new MemoryHost();
		const path = await createTask(host, {
			title: "Read chapter 3",
			number: 1,
			due: "2026-11-09",
			now: NOW,
		});
		expect(path).toBe("Planner/Read chapter 3.vnote");
		const task = taskFromNote(path, await readNote(host, path));
		expect(task?.title).toBe("Read chapter 3");
		expect(task?.kind).toBe("task");
		expect(task?.status).toBe("open");
		expect(task?.due).toBe("2026-11-09");
	});

	it("works when the Planner folder exists and picks a free name", async () => {
		const host = new MemoryHost();
		const a = await createTask(host, { title: "Same", number: 1, now: NOW });
		const b = await createTask(host, { title: "Same", number: 2, now: NOW });
		expect(a).not.toBe(b);
		expect(b.startsWith("Planner/")).toBe(true);
	});
});

describe("updateTask", () => {
	it("patches properties and leaves the rest of the note alone", async () => {
		const host = new MemoryHost();
		const path = await createTask(host, {
			title: "Pay rent",
			number: 4,
			due: "2026-11-10",
			now: NOW,
		});
		const before = await readNote(host, path);
		await updateTask(host, path, { status: "closed", now: NOW });
		const after = await readNote(host, path);
		const task = taskFromNote(path, after);
		expect(task?.status).toBe("closed");
		expect(task?.closedAt).toBe(NOW.toISOString());
		expect(task?.due).toBe("2026-11-10");
		expect(after.header.noteId).toBe(before.header.noteId);
		expect(after.blocks).toEqual(before.blocks);
	});

	it("removes a field when the patch sets it to null", async () => {
		const host = new MemoryHost();
		const path = await createTask(host, {
			title: "Dentist",
			number: 2,
			due: "2026-11-12",
			now: NOW,
		});
		await updateTask(host, path, { due: null });
		expect(taskFromNote(path, await readNote(host, path))?.due).toBeUndefined();
	});

	it("refuses a note with parse problems and does not rewrite it", async () => {
		const host = new MemoryHost();
		await host.makeFolder("Planner");
		await host.writeTextAtomic("Planner/Broken.vnote", "not a note at all\n");
		await expect(
			updateTask(host, "Planner/Broken.vnote", { starred: true }),
		).rejects.toThrow(/planner won't change it/);
		expect(await host.readText("Planner/Broken.vnote")).toBe(
			"not a note at all\n",
		);
	});

	it("refuses a note that parses but has a problem such as a repeated block id", async () => {
		const host = new MemoryHost();
		const path = await createTask(host, { title: "Dup", number: 1, now: NOW });
		const lines = (await host.readText(path)).trimEnd().split("\n");
		const damaged = `${[...lines, lines[lines.length - 1]].join("\n")}\n`;
		await host.writeTextAtomic(path, damaged);
		await expect(updateTask(host, path, { starred: true })).rejects.toThrow(
			/planner won't change it/,
		);
		expect(await host.readText(path)).toBe(damaged);
	});

	it("refuses a note with a line it cannot read", async () => {
		const host = new MemoryHost();
		const path = await createTask(host, { title: "Skip", number: 1, now: NOW });
		const damaged = `${await host.readText(path)}garbage line\n`;
		await host.writeTextAtomic(path, damaged);
		await expect(updateTask(host, path, { starred: true })).rejects.toThrow(
			/planner won't change it/,
		);
		expect(await host.readText(path)).toBe(damaged);
	});

	it("rejects when the note does not exist", async () => {
		await expect(
			updateTask(new MemoryHost(), "Planner/Missing.vnote", { starred: true }),
		).rejects.toThrow();
	});
});

describe("daily log actions", () => {
	it("loadLog is null until the day has a note", async () => {
		expect(await loadLog(new MemoryHost(), DAY)).toBeNull();
	});

	it("appendLogEntry creates Journal/<day>.vnote on first use", async () => {
		const host = new MemoryHost();
		const path = await appendLogEntry(host, DAY, null, "  Shipped it ");
		expect(path).toBe(DAY_PATH);
		expect(await loadLog(host, DAY)).not.toBeNull();
		expect((await logOf(host))[0]?.entries.map((e) => e.text)).toEqual([
			"Shipped it",
		]);
	});

	it("appends to the same day's note instead of creating a second one", async () => {
		const host = new MemoryHost();
		const first = await appendLogEntry(host, DAY, null, "one");
		const second = await appendLogEntry(host, DAY, null, "two");
		expect(second).toBe(first);
		expect(await host.list("Journal")).toHaveLength(1);
		expect((await logOf(host))[0]?.entries.map((e) => e.text)).toEqual([
			"one",
			"two",
		]);
	});

	it("puts an entry under the named section", async () => {
		const host = new MemoryHost();
		await appendLogSection(host, DAY, "Learned");
		const sectionId = (await logOf(host))[1]?.id as string;
		await appendLogEntry(host, DAY, sectionId, "closures");
		const sections = await logOf(host);
		expect(sections[1]?.name).toBe("Learned");
		expect(sections[1]?.entries.map((e) => e.text)).toEqual(["closures"]);
		expect(sections[0]?.entries).toEqual([]);
	});

	it("allows three sections and refuses the fourth without writing", async () => {
		const host = new MemoryHost();
		await appendLogSection(host, DAY, "A");
		await appendLogSection(host, DAY, "B");
		await appendLogSection(host, DAY, "C");
		const before = await host.readText(DAY_PATH);
		await expect(appendLogSection(host, DAY, "D")).rejects.toThrow(
			/up to three named sections/,
		);
		expect(await host.readText(DAY_PATH)).toBe(before);
	});

	it("refuses an empty section name", async () => {
		await expect(
			appendLogSection(new MemoryHost(), DAY, "   "),
		).rejects.toThrow();
	});

	it("refuses to change a damaged day note", async () => {
		const host = new MemoryHost();
		await host.makeFolder("Journal");
		await host.writeTextAtomic(DAY_PATH, "garbage\n");
		await expect(appendLogEntry(host, DAY, null, "hello")).rejects.toThrow(
			/planner won't change it/,
		);
		expect(await host.readText(DAY_PATH)).toBe("garbage\n");
	});

	it("an empty entry leaves the note's entries unchanged", async () => {
		const host = new MemoryHost();
		await appendLogEntry(host, DAY, null, "keep");
		await appendLogEntry(host, DAY, null, "   ");
		expect((await logOf(host))[0]?.entries.map((e) => e.text)).toEqual([
			"keep",
		]);
	});
});

describe("saveCheckIn", () => {
	it("creates the day's note, stores the slot and keeps the log entries", async () => {
		const host = new MemoryHost();
		await appendLogEntry(host, DAY, null, "hello");
		await saveCheckIn(host, DAY, "morning", {
			scales: { energy: 4 },
			note: "ok",
		});
		await saveCheckIn(host, DAY, "evening", { scales: { mood: 2 }, note: "" });
		const note = await readNote(host, DAY_PATH);
		expect(readCheckIn(note, "morning")).toEqual({
			scales: { energy: 4 },
			note: "ok",
		});
		expect(readCheckIn(note, "evening")).toEqual({
			scales: { mood: 2 },
			note: "",
		});
		expect((await logOf(host))[0]?.entries.map((e) => e.text)).toEqual([
			"hello",
		]);
	});
	it("writes nothing for an empty draft on an existing day", async () => {
		const host = new MemoryHost();
		await appendLogEntry(host, DAY, null, "hello");
		const before = await host.readText(DAY_PATH);
		await saveCheckIn(host, DAY, "afternoon", { scales: {}, note: "" });
		expect(await host.readText(DAY_PATH)).toBe(before);
	});
});
