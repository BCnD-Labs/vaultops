import { describe, expect, it } from "vitest";
import type { Note } from "../note-format";
import { headerProps, type Props, withProps } from "../notes/properties";
import {
	applyCheckIn,
	CHECK_IN_SLOTS,
	checkInPreview,
	checkInProblem,
	DEFAULT_CHECK_IN_CONFIG,
	emptyCheckIn,
	enabledSlots,
	MAX_NOTE_LENGTH,
	prominentSlot,
	readCheckIn,
	resolveConfig,
	setScale,
	slotAt,
	unchanged,
} from "./check-in";
import { newLogNote } from "./log";

const log = (): Note => ({
	...(newLogNote("2026-11-09") as Note),
	blocks: [],
});
const at = (h: number, m = 0) => new Date(2026, 10, 9, h, m);
const props = (n: Note) => headerProps(n.header) as Record<string, unknown>;
const withEntries = (n: Note, e: Record<string, unknown>): Note => ({
	...n,
	header: withProps(n.header, { ...headerProps(n.header), ...e } as Props),
});

describe("config", () => {
	it("has all slots on with 05:00 / 12:00 / 17:00", () => {
		expect(DEFAULT_CHECK_IN_CONFIG.enabled).toEqual({
			morning: true,
			afternoon: true,
			evening: true,
		});
		expect(DEFAULT_CHECK_IN_CONFIG.starts).toEqual({
			morning: "05:00",
			afternoon: "12:00",
			evening: "17:00",
		});
		expect(resolveConfig({})).toEqual(DEFAULT_CHECK_IN_CONFIG);
	});
	it("keeps valid custom times and ignores malformed ones", () => {
		const c = resolveConfig({
			starts: { morning: "06:30", afternoon: "99:00" },
		});
		expect(c.starts).toEqual({
			morning: "06:30",
			afternoon: "12:00",
			evening: "17:00",
		});
	});
	it("falls back to defaults when starts do not rise", () => {
		const c = resolveConfig({ starts: { morning: "13:00" } });
		expect(c.starts).toEqual(DEFAULT_CHECK_IN_CONFIG.starts);
	});
	it("lists only enabled slots", () => {
		const c = resolveConfig({ enabled: { afternoon: false } });
		expect(enabledSlots(c)).toEqual(["morning", "evening"]);
	});
});

describe("slotAt", () => {
	const c = DEFAULT_CHECK_IN_CONFIG;
	it("picks the slot by time, boundaries inclusive", () => {
		expect(slotAt(c, at(5, 0))).toBe("morning");
		expect(slotAt(c, at(11, 59))).toBe("morning");
		expect(slotAt(c, at(12, 0))).toBe("afternoon");
		expect(slotAt(c, at(16, 59))).toBe("afternoon");
		expect(slotAt(c, at(17, 0))).toBe("evening");
	});
	it("treats the small hours as the evening", () => {
		expect(slotAt(c, at(2, 15))).toBe("evening");
	});
	it("follows custom boundaries", () => {
		const custom = resolveConfig({
			starts: { morning: "07:00", afternoon: "13:30", evening: "19:00" },
		});
		expect(slotAt(custom, at(6, 59))).toBe("evening");
		expect(slotAt(custom, at(13, 29))).toBe("morning");
		expect(slotAt(custom, at(13, 30))).toBe("afternoon");
	});
	it("is prominent only today and only when enabled", () => {
		expect(prominentSlot(DEFAULT_CHECK_IN_CONFIG, at(9), true)).toBe("morning");
		expect(prominentSlot(DEFAULT_CHECK_IN_CONFIG, at(9), false)).toBeNull();
		const off = resolveConfig({ enabled: { morning: false } });
		expect(prominentSlot(off, at(9), true)).toBeNull();
	});
	it("covers every slot", () => {
		expect(CHECK_IN_SLOTS).toHaveLength(3);
	});
});

describe("reading and writing", () => {
	it("stores scales as select properties and the note as text", () => {
		let d = setScale(emptyCheckIn(), "energy", 3);
		d = setScale(d, "mood", 5);
		d = { ...d, note: "  slow start " };
		const next = applyCheckIn(log(), "morning", d);
		expect(props(next)["Morning energy"]).toEqual({
			type: "select",
			value: "3",
			options: ["1", "2", "3", "4", "5"],
		});
		expect(props(next)["Morning mood"]).toMatchObject({ value: "5" });
		expect(props(next)["Morning focus"]).toBeUndefined();
		expect(props(next)["Morning note"]).toEqual({
			type: "text",
			value: "slow start",
		});
		expect(props(next).Date).toEqual({ type: "date", value: "2026-11-09" });
		expect(readCheckIn(next, "morning")).toEqual({
			scales: { energy: 3, mood: 5 },
			note: "slow start",
		});
		expect(readCheckIn(next, "evening")).toEqual(emptyCheckIn());
	});
	it("returns the very same note when nothing changed", () => {
		const note = log();
		expect(applyCheckIn(note, "evening", emptyCheckIn())).toBe(note);
		const saved = applyCheckIn(
			note,
			"evening",
			setScale(emptyCheckIn(), "focus", 2),
		);
		expect(
			applyCheckIn(saved, "evening", setScale(emptyCheckIn(), "focus", 2)),
		).toBe(saved);
	});
	it("clearing a value removes its property", () => {
		const a = applyCheckIn(
			log(),
			"afternoon",
			setScale(emptyCheckIn(), "mood", 4),
		);
		const b = applyCheckIn(a, "afternoon", emptyCheckIn());
		expect(props(b)["Afternoon mood"]).toBeUndefined();
		expect(readCheckIn(b, "afternoon")).toEqual(emptyCheckIn());
	});
	it("slots do not disturb each other or other properties", () => {
		let n = applyCheckIn(
			log(),
			"morning",
			setScale(emptyCheckIn(), "energy", 2),
		);
		n = applyCheckIn(n, "evening", setScale(emptyCheckIn(), "energy", 4));
		expect(readCheckIn(n, "morning").scales.energy).toBe(2);
		expect(readCheckIn(n, "evening").scales.energy).toBe(4);
		expect(props(n).Date).toBeDefined();
	});
	it("keeps a user's own options and reads number-typed values", () => {
		const note = withEntries(log(), {
			"Morning energy": {
				type: "select",
				value: "2",
				options: ["1", "2", "3", "4", "5", "6"],
			},
			"Morning mood": { type: "number", value: 4 },
		});
		expect(readCheckIn(note, "morning").scales).toEqual({ energy: 2, mood: 4 });
		const next = applyCheckIn(
			note,
			"morning",
			setScale(readCheckIn(note, "morning"), "energy", 3),
		);
		expect(
			(props(next)["Morning energy"] as { options: string[] }).options,
		).toHaveLength(6);
	});
	it("ignores out-of-range stored values", () => {
		const note = withEntries(log(), {
			"Morning energy": { type: "select", value: "9", options: ["9"] },
		});
		expect(readCheckIn(note, "morning").scales).toEqual({});
	});
});

describe("draft helpers", () => {
	it("previews filled values and compares ignoring blanks", () => {
		const d = { scales: { energy: 3, focus: 1 }, note: "x" };
		expect(checkInPreview(d)).toBe("Energy 3 · Focus 1 · note");
		expect(checkInPreview(emptyCheckIn())).toBe("");
		expect(unchanged({ scales: {}, note: "  " }, emptyCheckIn())).toBe(true);
		expect(unchanged(setScale(emptyCheckIn(), "mood", 2), emptyCheckIn())).toBe(
			false,
		);
	});
	it("setScale(null) unsets", () => {
		expect(
			setScale(setScale(emptyCheckIn(), "mood", 2), "mood", null).scales,
		).toEqual({});
	});
	it("flags an over-long note", () => {
		expect(
			checkInProblem({ scales: {}, note: "x".repeat(MAX_NOTE_LENGTH + 1) }),
		).toMatch(/too long/);
		expect(checkInProblem(emptyCheckIn())).toBeUndefined();
	});
});
