// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { formatDate, formatTime } from "../core/notes/templates";
import { newNoteFolder, settings, templateFormats } from "./settings";

describe("new note folder and template formats", () => {
	afterEach(() => localStorage.clear());
	it("follows Where new notes go, falling back to the root for a missing folder", () => {
		const folders = ["Class", "_Inbox"];
		expect(newNoteFolder("Class", folders)).toBe("Class");
		settings.set("files.newNoteLocation", "root");
		expect(newNoteFolder("Class", folders)).toBe("");
		settings.set("files.newNoteLocation", "folder");
		settings.set("files.newNoteFolder", "/_Inbox/");
		expect(newNoteFolder("Class", folders)).toBe("_Inbox");
		settings.set("files.newNoteFolder", "Missing");
		expect(newNoteFolder("Class", folders)).toBe("");
	});
	it("hands the picked date and time formats to templates", () => {
		expect(templateFormats()).toEqual({ date: "YYYY-MM-DD", time: "24h" });
		settings.set("templates.dateFormat", "DD MMM YYYY");
		settings.set("templates.timeFormat", "12h");
		expect(templateFormats()).toEqual({ date: "DD MMM YYYY", time: "12h" });
	});
	it("reads and writes canvas snap under the toolbar's own key", () => {
		localStorage.setItem("vaultops:canvas-snap", "true");
		expect(settings.get("canvas.snap")).toBe("grid");
		settings.set("canvas.snap", "both");
		expect(localStorage.getItem("vaultops:canvas-snap")).toBe("both");
		settings.set("canvas.snap", "off");
		expect(localStorage.getItem("vaultops:canvas-snap")).toBe("false");
	});
});

it("writes {{date}} and {{time}} in each format", () => {
	const at = new Date(2026, 10, 3, 14, 5);
	expect(formatDate(at, "YYYY-MM-DD")).toBe("2026-11-03");
	expect(formatDate(at, "DD MMM YYYY")).toBe("03 Nov 2026");
	expect(formatDate(at, "MMM D, YYYY")).toBe("Nov 3, 2026");
	expect(formatDate(at, "MM/DD/YYYY")).toBe("11/03/2026");
	expect(formatDate(at, "DD/MM/YYYY")).toBe("03/11/2026");
	expect(formatTime(at, "24h")).toBe("14:05");
	expect(formatTime(at, "12h")).toBe("2:05 PM");
	expect(formatTime(new Date(2026, 0, 1, 0, 7), "12h")).toBe("12:07 AM");
});
