// @vitest-environment happy-dom
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import type { Editor } from "@tiptap/core";
import { afterEach, expect, it, vi } from "vitest";
import { addDaysToKey, keyOfDate } from "../../core/planner/dates";
import { logPath } from "../../core/planner/log";
import { MemoryHost } from "../../host/memory-host";
import { App } from "../App";
import { appendLogEntry } from "../planner/actions";
import { loadVault } from "../session";
import { settings } from "../settings";

const setPlanner = settings.set as (key: string, value: boolean) => void;
afterEach(() => {
	cleanup();
	localStorage.clear();
	setPlanner("features.planner", true);
	vi.unstubAllGlobals();
});

async function openJournal(host: MemoryHost) {
	vi.stubGlobal("IntersectionObserver", undefined);
	render(<App host={host} />);
	fireEvent.click(await screen.findByRole("button", { name: "Journal" }));
	return screen.findByRole("region", { name: "Journal" });
}

it("lists daily logs newest first, keeps today first, and creates today on edit", async () => {
	const host = new MemoryHost();
	const today = keyOfDate(new Date());
	const recent = addDaysToKey(today, -2);
	const older = addDaysToKey(today, -9);
	await loadVault(host);
	await appendLogEntry(host, older, null, "Older");
	await appendLogEntry(host, recent, null, "Recent");
	const journal = await openJournal(host);
	expect(
		[...journal.querySelectorAll("time")].map((node) => node.dateTime),
	).toEqual([today, recent, older]);
	expect(await host.kindOf(logPath(today))).toBeNull();
	await within(journal).findByText("Older");
	await writeToday(journal, "First entry");
	fireEvent.click(screen.getByRole("button", { name: "Back to notes" }));
	await screen.findByRole("textbox", { name: "Title" });
	expect(await host.readText(logPath(today))).toContain("First entry");
});

it("hides the sidebar entry when Planner is switched off", async () => {
	render(<App host={new MemoryHost()} />);
	await screen.findByRole("button", { name: "Journal" });
	act(() => setPlanner("features.planner", false));
	expect(screen.queryByRole("button", { name: "Journal" })).toBeNull();
});

async function writeToday(journal: HTMLElement, text: string) {
	const editor = await waitFor(() => {
		const dom = journal.querySelector<HTMLElement & { editor: Editor }>(
			'.journal-day:first-child .tiptap[contenteditable="true"]',
		);
		if (!dom?.editor) throw new Error("Expected today's editor.");
		return dom.editor;
	});
	act(() => {
		editor.commands.insertContent(text);
	});
}

it("keeps an unsaved first entry in quit recovery", async () => {
	const host = new MemoryHost();
	const path = logPath(keyOfDate(new Date()));
	const write = host.writeTextAtomic.bind(host);
	vi.spyOn(host, "writeTextAtomic").mockImplementation(async (target, text) => {
		if (target === path) throw new Error("The disk refused this write.");
		await write(target, text);
	});
	await writeToday(await openJournal(host), "Keep this draft");
	await act(async () => {
		expect(await host.simulateClose()).toBe(false);
		expect(await host.simulateClose()).toBe(true);
	});
	const recovery = await host.readAppFile("unsaved-recovery.txt");
	expect(recovery).toContain(path);
	expect(recovery).toContain("Keep this draft");
	expect(await host.kindOf(path)).toBeNull();
});

function calendarDay(day: string) {
	const calendar = screen.getByRole("complementary", {
		name: "Journal calendar",
	});
	const cell = calendar.querySelector<HTMLElement>(`[data-mini-date="${day}"]`);
	if (!cell) throw new Error(`No calendar cell for ${day}.`);
	return cell;
}

it("marks logged days on the calendar and scrolls to a day when clicked", async () => {
	const host = new MemoryHost();
	const today = keyOfDate(new Date());
	const yesterday = addDaysToKey(today, -1);
	await loadVault(host);
	await appendLogEntry(host, yesterday, null, "Yesterday");
	const scroll = vi.fn();
	Element.prototype.scrollIntoView = scroll;
	await openJournal(host);
	await waitFor(() =>
		expect(calendarDay(yesterday).getAttribute("aria-label")).toContain(
			"has a log",
		),
	);
	fireEvent.click(calendarDay(yesterday));
	await waitFor(() =>
		expect(scroll.mock.contexts).toContain(
			document.getElementById(`journal-day-${yesterday}`),
		),
	);
});

it("adds a picked day without a log to the feed and writes nothing", async () => {
	const host = new MemoryHost();
	const today = keyOfDate(new Date());
	const empty = addDaysToKey(today, -1);
	await loadVault(host);
	Element.prototype.scrollIntoView = vi.fn();
	const journal = await openJournal(host);
	fireEvent.click(calendarDay(empty));
	await waitFor(() =>
		expect(
			[...journal.querySelectorAll("time")].map((node) => node.dateTime),
		).toEqual([today, empty]),
	);
	expect(await host.kindOf(logPath(empty))).toBeNull();
});

it("lists the same date in earlier years under On this day", async () => {
	const host = new MemoryHost();
	const today = keyOfDate(new Date());
	const lastYear = `${Number(today.slice(0, 4)) - 1}${today.slice(4)}`;
	await loadVault(host);
	await appendLogEntry(host, lastYear, null, "A year ago");
	await appendLogEntry(host, addDaysToKey(today, -3), null, "Not this day");
	await openJournal(host);
	const memories = await screen.findByRole("region", { name: "On this day" });
	expect(within(memories).getAllByRole("button")).toHaveLength(1);
});
