import { describe, expect, it } from "vitest";
import { linksIn } from "../links/links";
import type { Note } from "../note-format";
import { parseNote, serializeNote } from "../note-format";
import { addEntry, readLog } from "./log";
import {
	closedDay,
	completedOn,
	dueOn,
	previewLine,
	recentEntries,
	weekStrip,
} from "./log-rules";
import type { PlannerTask } from "./rules";

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
const empty = (): Note => ({
	header: { format: "vaultops-note", v: 1, noteId: "n" },
	blocks: [],
});

describe("closedDay", () => {
	it("uses the given offset, so the result does not depend on the machine", () => {
		// 23:30 UTC on the 4th is still the 4th in New York (offset 300) ...
		expect(closedDay("2026-11-05T01:30:00Z", 300)).toBe("2026-11-04");
		// ... and already the 5th in Tokyo (offset -540).
		expect(closedDay("2026-11-04T23:30:00Z", -540)).toBe("2026-11-05");
	});
	it("takes a bare date as that day and ignores bad values", () => {
		expect(closedDay("2026-11-04", 300)).toBe("2026-11-04");
		expect(closedDay("nope")).toBeUndefined();
		expect(closedDay(undefined)).toBeUndefined();
	});
});

describe("completedOn / dueOn", () => {
	const tasks = [
		task({ number: 1, status: "closed", closedAt: "2026-11-05T15:00:00Z" }),
		task({ number: 2, status: "closed", closedAt: "2026-11-05T09:00:00Z" }),
		task({ number: 3, status: "closed", closedAt: "2026-11-04T12:00:00Z" }),
		task({ number: 4, due: "2026-11-05" }),
		task({ number: 5, due: "2026-11-05", starred: true }),
		task({
			number: 6,
			due: "2026-11-05",
			status: "closed",
			closedAt: "2026-11-05T10:00:00Z",
		}),
		task({ number: 7, kind: "event", due: "2026-11-05" }),
		task({ number: 8, status: "closed" }),
	];
	it("lists tasks closed that day, earliest first, with no events or open tasks", () => {
		expect(completedOn(tasks, "2026-11-05", 0).map((t) => t.number)).toEqual([
			2, 6, 1,
		]);
	});
	it("lists open tasks due that day, starred first, with no events or closed tasks", () => {
		expect(dueOn(tasks, "2026-11-05").map((t) => t.number)).toEqual([5, 4]);
		expect(dueOn(tasks, "2026-11-06")).toEqual([]);
	});
});

describe("weekStrip", () => {
	it("gives the seven days of the week with dots, today and the selected day", () => {
		const strip = weekStrip(
			"2026-11-05",
			"2026-11-03",
			new Set(["2026-11-02", "2026-11-05"]),
		);
		expect(strip.map((d) => d.key)).toEqual([
			"2026-11-01",
			"2026-11-02",
			"2026-11-03",
			"2026-11-04",
			"2026-11-05",
			"2026-11-06",
			"2026-11-07",
		]);
		expect(strip.filter((d) => d.has).map((d) => d.key)).toEqual([
			"2026-11-02",
			"2026-11-05",
		]);
		expect(strip.find((d) => d.today)?.key).toBe("2026-11-03");
		expect(strip.find((d) => d.selected)?.key).toBe("2026-11-05");
	});
	it("can start the week on Monday", () => {
		expect(weekStrip("2026-11-05", "2026-11-05", new Set(), 1)[0]?.key).toBe(
			"2026-11-02",
		);
	});
});

describe("previewLine / recentEntries", () => {
	it("takes the first line with words, without markers", () => {
		expect(previewLine("\n## Shipped\n- a thing")).toBe("Shipped");
		expect(previewLine("   ")).toBe("");
		expect(previewLine("x".repeat(200)).length).toBe(90);
	});
	it("lists the latest logged days up to today, newest first, within the limit", () => {
		const rows = [
			{ path: "Journal/2026-11-01.vnote", preview: "one" },
			{ path: "Journal/2026-11-03.vnote", preview: "three" },
			{ path: "Journal/2026-11-04.vnote", preview: "  " },
			{ path: "Journal/2026-11-09.vnote", preview: "future" },
			{ path: "Planner/x.vnote", preview: "task" },
			{ path: "Journal/2026-11-02.vnote", preview: "two" },
		];
		expect(recentEntries(rows, "2026-11-05", 2).map((e) => e.day)).toEqual([
			"2026-11-03",
			"2026-11-02",
		]);
	});
});

describe("entries with links", () => {
	const link = { kind: "note" as const, target: "n-1", label: "Trip plan" };
	it("saves a link as the editor's own noteLink item and reads it back", () => {
		const note = addEntry(empty(), null, "met about", [link]);
		const para = note.blocks[0];
		expect(JSON.stringify(para?.content)).toContain('"type":"noteLink"');
		expect(linksIn(note.blocks)).toEqual([link]);
		const entry = readLog(note)[0]?.entries[0];
		expect(entry?.text.trim()).toBe("met about");
		expect(entry?.links).toEqual([link]);
	});
	it("round-trips through the file format and stays plain without links", () => {
		const note = addEntry(empty(), null, "x", [link]);
		const again = parseNote(serializeNote(note)).note;
		expect(linksIn(again?.blocks ?? [])).toEqual([link]);
		expect(
			readLog(addEntry(empty(), null, "plain"))[0]?.entries[0]?.links,
		).toEqual([]);
	});
});
