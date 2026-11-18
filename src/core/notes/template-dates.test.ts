import { describe, expect, it } from "vitest";
import type { Note } from "../note-format";
import {
	formatTemplateDate,
	templateDateKey,
	templateTime,
} from "./template-dates";
import { blocksFromTemplate } from "./templates";

const now = new Date(2026, 10, 18, 23, 45);

describe("template date maths", () => {
	it.each([
		["today", "2026-11-18"],
		["tomorrow", "2026-11-19"],
		["yesterday", "2026-11-17"],
		["today + 3 days", "2026-11-21"],
		["- 2 weeks", "2026-11-04"],
		["+3d", "2026-11-21"],
		["+1 month", "2026-12-18"],
		["+1 year", "2027-11-18"],
		["next Monday", "2026-11-23"],
		["last Friday", "2026-11-13"],
		["this Monday", "2026-11-16"],
		["start of month", "2026-11-01"],
		["end of month", "2026-11-30"],
		["start of year", "2026-01-01"],
		["end of year", "2026-12-31"],
		["start of week + 2 days", "2026-11-17"],
	])("resolves %s", (expression, expected) => {
		expect(templateDateKey(expression, now)).toBe(expected);
	});
	it("uses the configured week start", () => {
		expect(templateDateKey("start of week", now, 0)).toBe("2026-11-15");
		expect(templateDateKey("start of week", now, 1)).toBe("2026-11-16");
		expect(templateDateKey("end of week", now, 0)).toBe("2026-11-21");
		expect(templateDateKey("end of week", now, 1)).toBe("2026-11-22");
	});
	it("clamps month and year offsets, and never treats today as next or last", () => {
		const jan = new Date(2024, 0, 31);
		expect(templateDateKey("+1 month", jan)).toBe("2024-02-29");
		expect(templateDateKey("+1 year", new Date(2024, 1, 29))).toBe(
			"2025-02-28",
		);
		expect(templateDateKey("next Wednesday", now)).toBe("2026-11-25");
		expect(templateDateKey("last Wednesday", now)).toBe("2026-11-11");
	});
	it("formats supported tokens", () => {
		expect(
			formatTemplateDate("2026-11-23", "ddd, MMM D / dddd DD MM YYYY"),
		).toBe("Mon, Nov 23 / Monday 23 11 2026");
		expect(formatTemplateDate("2026-11-23", "bad")).toBeNull();
	});
	it("resolves time offsets across midnight", () => {
		expect(templateTime("+30m", now)?.getDate()).toBe(19);
		expect(templateTime("+2h", now)?.getHours()).toBe(1);
		expect(templateTime("-1h", now)?.getHours()).toBe(22);
	});
	it("fills placeholders and preserves malformed and unknown braces", () => {
		const input =
			"{{title}} {{date}} {{time}} {{date:next Monday|ddd, MMM D}} {{date|DD/MM/YYYY}} {{date:start of week}} {{time:+30m}} {{time:+2h}} {{date:nonsense}} {{date:+999999999999999999d}} {{date:today|bogus}} {{time:+30q}} {{other}}";
		const note: Note = {
			header: { format: "vaultops-note", v: 1, noteId: "n", title: "T" },
			blocks: [
				{
					id: "a",
					type: "paragraph",
					parent: null,
					content: [{ type: "text", text: input }],
				},
			],
		};
		const blocks = blocksFromTemplate(
			note,
			"Plan",
			now,
			{ date: "YYYY-MM-DD", time: "12h" },
			1,
		);
		expect(blocks[0]?.content).toEqual([
			{
				type: "text",
				text: "Plan 2026-11-18 11:45 PM Mon, Nov 23 18/11/2026 2026-11-16 12:15 AM 1:45 AM {{date:nonsense}} {{date:+999999999999999999d}} {{date:today|bogus}} {{time:+30q}} {{other}}",
			},
		]);
	});
});
