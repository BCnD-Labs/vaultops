import { describe, expect, it } from "vitest";
import { bundleReport, reportFileName } from "./report-bundle";

describe("reportFileName", () => {
	it("is a safe .txt name made from the time", () => {
		const name = reportFileName(new Date("2026-10-28T23:30:05.123Z"));
		expect(name).toBe("vaultops-report-2026-10-28T23-30-05Z.txt");
		expect(reportFileName(new Date("2026-10-28T23:30:05Z"), "crash")).toBe(
			"vaultops-crash-2026-10-28T23-30-05Z.txt",
		);
		expect(name).toMatch(/^[A-Za-z0-9_-][A-Za-z0-9_.-]*\.txt$/);
	});
});

describe("bundleReport", () => {
	it("puts the three parts in order", () => {
		const text = bundleReport({ debug: "D", logTail: "L1\nL2", crash: "C" });
		expect(text.indexOf("D")).toBeLessThan(text.indexOf("L1"));
		expect(text.indexOf("L2")).toBeLessThan(text.indexOf("\nC"));
		expect(text.endsWith("\n")).toBe(true);
	});

	it("says when the log or the crash report is missing", () => {
		const text = bundleReport({ debug: "D", logTail: "  ", crash: null });
		expect(text).toContain("(the log was empty)");
		expect(text).toContain("(none saved)");
	});
});
