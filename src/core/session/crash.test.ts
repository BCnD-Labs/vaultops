import { describe, expect, it } from "vitest";
import {
	buildCrashReport,
	cleanMarker,
	parseMarker,
	runningMarker,
} from "./crash";

const NOW = new Date("2026-10-28T12:00:00.000Z");

describe("session marker", () => {
	it("round-trips a running marker", () => {
		expect(parseMarker(runningMarker(NOW, "0.1.0"))).toEqual({
			state: "running",
			startedAt: NOW.toISOString(),
			version: "0.1.0",
		});
	});

	it("a clean marker keeps when the run started", () => {
		const running = parseMarker(runningMarker(NOW, "0.1.0"));
		const later = new Date("2026-10-28T13:00:00.000Z");
		expect(parseMarker(cleanMarker(running, later))).toEqual({
			state: "clean",
			startedAt: NOW.toISOString(),
			version: "0.1.0",
		});
	});

	it("treats a missing or unreadable marker as no marker", () => {
		expect(parseMarker(null)).toBeNull();
		expect(parseMarker("")).toBeNull();
		expect(parseMarker("not json")).toBeNull();
		expect(parseMarker("[]")).toBeNull();
		expect(
			parseMarker('{"state":"other","startedAt":"x","version":"y"}'),
		).toBeNull();
		expect(parseMarker('{"state":"running"}')).toBeNull();
	});
});

describe("buildCrashReport", () => {
	it("includes the notes and the log lines", () => {
		const text = buildCrashReport({
			startedAt: "2026-10-28T11:00:00.000Z",
			version: "0.1.0",
			logTail: "line a\nline b\n",
			notes: "  typing in a long note  ",
			now: NOW,
		});
		expect(text).toContain("app version: 0.1.0");
		expect(text).toContain("typing in a long note");
		expect(text).toContain("line a\nline b");
		expect(text.endsWith("\n")).toBe(true);
	});

	it("says when nothing was written or logged", () => {
		const text = buildCrashReport({
			startedAt: "x",
			version: "",
			logTail: " ",
			notes: "",
			now: NOW,
		});
		expect(text).toContain("(not filled in)");
		expect(text).toContain("(the log was empty)");
		expect(text).toContain("app version: unknown");
	});
});
