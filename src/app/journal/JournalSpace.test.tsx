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

const setPlanner = (enabled: boolean) =>
	(settings.set as (key: string, value: boolean) => unknown)(
		"features.planner",
		enabled,
	);

afterEach(() => {
	cleanup();
	localStorage.clear();
	setPlanner(true);
	vi.unstubAllGlobals();
});

it("lists daily logs newest first, keeps today first, and creates today on edit", async () => {
	vi.stubGlobal("IntersectionObserver", undefined);
	const host = new MemoryHost();
	const today = keyOfDate(new Date());
	const recent = addDaysToKey(today, -2);
	const older = addDaysToKey(today, -9);
	await loadVault(host);
	await appendLogEntry(host, older, null, "Older");
	await appendLogEntry(host, recent, null, "Recent");
	render(<App host={host} />);
	fireEvent.click(await screen.findByRole("button", { name: "Journal" }));
	const journal = within(
		await screen.findByRole("region", { name: "Journal" }),
	);
	expect(
		journal
			.getAllByRole("heading")
			.map((heading) => heading.querySelector("time")?.dateTime),
	).toEqual([today, recent, older]);
	expect(await host.kindOf(logPath(today))).toBeNull();

	await journal.findByText("Older");
	const day = journal.getAllByRole("region")[0];
	const editor = await waitFor(() => {
		const dom = day?.querySelector<HTMLElement & { editor: Editor }>(".tiptap");
		expect(dom?.editor).toBeDefined();
		return dom?.editor;
	});
	act(() => {
		editor?.commands.insertContent("First entry");
	});
	fireEvent.click(screen.getByRole("button", { name: "Back to notes" }));
	await screen.findByRole("textbox", { name: "Title" });
	expect(await host.readText(logPath(today))).toContain("First entry");
});

it("hides the sidebar entry when Planner is switched off", async () => {
	render(<App host={new MemoryHost()} />);
	await screen.findByRole("button", { name: "Journal" });
	act(() => setPlanner(false));
	expect(screen.queryByRole("button", { name: "Journal" })).toBeNull();
});
