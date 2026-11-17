// @vitest-environment happy-dom
import {
	cleanup,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { keyOfDate } from "../../core/planner/dates";
import { MemoryHost } from "../../host/memory-host";
import type { NoteRow } from "../session";
import { createTask } from "./actions";
import { PlannerProvider } from "./PlannerContext";
import { PlannerPanel } from "./PlannerPanel";

afterEach(() => {
	cleanup();
	localStorage.clear();
});

const today = keyOfDate(new Date());

const taskRow = () =>
	within(screen.getByRole("region", { name: "Tasks" })).getByRole("button", {
		name: /Write it up/,
	});

async function setup() {
	localStorage.setItem("vaultops:calendar-button", "0");
	const host = new MemoryHost();
	const path = await createTask(host, {
		title: "Write it up",
		number: 1,
		due: today,
		now: new Date(),
	});
	const task = {
		path,
		number: 1,
		title: "Write it up",
		status: "open" as const,
		kind: "task" as const,
		due: today,
		starred: false,
		labels: [],
		preview: "",
	};
	const rows: NoteRow[] = [
		{ path, title: task.title, preview: "", readOnly: false, tags: [], task },
	];
	const onChanged = vi.fn(async () => {});
	const view = () => (
		<TooltipProvider>
			<PlannerProvider
				notes={rows}
				host={host}
				writable
				onChanged={onChanged}
				onOpenNote={() => {}}
				onOpenScreen={() => {}}
			>
				<PlannerPanel />
			</PlannerProvider>
		</TooltipProvider>
	);
	render(view());
	return { host, path, onChanged, view };
}

it("is one page: no collapsible toggles, and the calendar, then the switch, then the tasks", async () => {
	await setup();
	const planner = screen.getByRole("region", { name: "Planner" });
	expect(
		planner.querySelector(".planner-section, .planner-section-toggle"),
	).toBeNull();
	for (const name of ["Calendar", "Tasks", "Today's log"])
		expect(screen.queryByRole("button", { name })).toBeNull();
	const calendar = planner.querySelector('section[aria-label="Calendar"]');
	const switcher = screen.getByRole("radiogroup", { name: "Planner view" });
	const tasks = screen.getByRole("region", { name: "Tasks" });
	const before = (a: Element | null, b: Element) =>
		Boolean(
			(a?.compareDocumentPosition(b) ?? 0) & Node.DOCUMENT_POSITION_FOLLOWING,
		);
	expect(before(calendar, switcher)).toBe(true);
	expect(before(switcher, tasks)).toBe(true);
});

it("shows the daily log from the Tasks | Log switch and remembers the choice", async () => {
	const { view } = await setup();
	expect(
		screen.getByRole("radio", { name: "Tasks" }).getAttribute("aria-checked"),
	).toBe("true");
	await userEvent.click(screen.getByRole("radio", { name: "Log" }));
	expect(await screen.findByRole("region", { name: "Daily log" })).toBeTruthy();
	expect(screen.queryByRole("region", { name: "Tasks" })).toBeNull();
	expect(localStorage.getItem("vaultops:planner-view")).toBe("log");
	cleanup();
	render(view());
	expect(await screen.findByRole("region", { name: "Daily log" })).toBeTruthy();
	await userEvent.click(screen.getByRole("radio", { name: "Tasks" }));
	expect(screen.getByRole("region", { name: "Tasks" })).toBeTruthy();
});

it("adds an event from the + menu in Event mode", async () => {
	const { host, onChanged } = await setup();
	await userEvent.click(
		screen.getByRole("button", { name: "Add a task or event" }),
	);
	expect(
		await screen.findByRole("menuitem", { name: "New task" }),
	).toBeTruthy();
	await userEvent.click(screen.getByRole("menuitem", { name: "New event" }));
	expect(await screen.findByText("New event")).toBeTruthy();
	expect(
		screen.getByRole("tab", { name: "Event" }).getAttribute("aria-selected"),
	).toBe("true");
	await userEvent.type(screen.getByLabelText("Description"), "Dentist");
	await userEvent.click(screen.getByRole("button", { name: "Create event" }));
	await waitFor(() => expect(onChanged).toHaveBeenCalled());
	const calls = onChanged.mock.calls as unknown as [string[]][];
	const path = calls[0]?.[0][0] ?? "";
	const text = await host.readText(path);
	expect(text).toContain("Dentist");
	expect(text).toMatch(/Kind.{0,60}event/);
});

it("opens a task's details window on click, with every inspector action", async () => {
	const { host, path } = await setup();
	await userEvent.click(taskRow());
	const dialog = await screen.findByRole("dialog", { name: "Task" });
	// Inspector actions are all here: star, status, Open note, Edit.
	expect(
		within(dialog).getByRole("button", { name: "Open note" }),
	).toBeTruthy();
	expect(within(dialog).getByRole("checkbox")).toBeTruthy();
	await userEvent.click(within(dialog).getByRole("button", { name: "Star" }));
	await waitFor(async () =>
		expect(await host.readText(path)).toMatch(/"Starred":\{[^}]*true/),
	);

	// Edit opens the full form; Escape there discards and returns to details.
	await userEvent.click(
		within(dialog).getByRole("button", { name: "Edit task" }),
	);
	const field = await screen.findByLabelText("Description");
	await userEvent.clear(field);
	await userEvent.type(field, "Discarded");
	await userEvent.keyboard("{Escape}");
	await waitFor(() =>
		expect(screen.queryByLabelText("Description")).toBeNull(),
	);
	expect(await host.readText(path)).not.toContain("Discarded");

	await userEvent.click(screen.getByRole("button", { name: "Edit task" }));
	const again = await screen.findByLabelText("Description");
	await userEvent.clear(again);
	await userEvent.type(again, "Kept");
	await userEvent.click(screen.getByRole("button", { name: "Save task" }));
	await waitFor(async () =>
		expect(await host.readText(path)).toContain("Kept"),
	);

	await userEvent.keyboard("{Escape}");
	await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});

it("starts with the switch when the calendar is docked out", async () => {
	localStorage.setItem("vaultops:calendar-dock", "right");
	await setup();
	const planner = screen.getByRole("region", { name: "Planner" });
	expect(planner.querySelector('section[aria-label="Calendar"]')).toBeNull();
	expect(screen.queryByRole("img", { name: "Drag the calendar" })).toBeNull();
	expect(screen.getByRole("radiogroup", { name: "Planner view" })).toBeTruthy();
});
