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
