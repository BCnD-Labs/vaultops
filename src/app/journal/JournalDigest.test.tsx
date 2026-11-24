// @vitest-environment happy-dom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { PlannerTask } from "../../core/planner/rules";
import { MemoryHost } from "../../host/memory-host";
import { settings } from "../settings";
import { JournalInsights, TodaySoFar } from "./JournalDigest";

afterEach(() => {
	cleanup();
	for (const key of [
		"planner.journal.today",
		"planner.journal.weeklyReview",
		"planner.journal.prompts",
		"planner.journal.prompt.overdue",
	] as const)
		settings.reset(key);
});

const day = "2026-11-24";
const noon = new Date(`${day}T12:00:00`);
const notes = [
	{ path: "Plan.vnote", title: "Plan", updatedAt: noon.getTime(), tags: [] },
];
const tasks: PlannerTask[] = [
	{
		path: "Planner/t1.vnote",
		number: 1,
		title: "Send essay",
		status: "closed",
		kind: "task",
		starred: false,
		labels: [],
		preview: "",
		closedAt: noon.toISOString(),
	},
	{
		path: "Planner/t2.vnote",
		number: 2,
		title: "Late one",
		status: "open",
		kind: "task",
		starred: false,
		labels: [],
		preview: "",
		due: "2026-11-01",
	},
];

it("lists what was done and saved on the day, opens it, and can be turned off", async () => {
	const onOpen = vi.fn();
	render(<TodaySoFar day={day} notes={notes} tasks={tasks} onOpen={onOpen} />);
	screen.getByRole("button", { name: "Send essay" }).click();
	expect(onOpen).toHaveBeenCalledWith("Planner/t1.vnote");
	expect(screen.getByRole("button", { name: "Plan" })).toBeTruthy();
	act(() => {
		settings.set("planner.journal.today", false);
	});
	expect(screen.queryByRole("region", { name: "Today, so far" })).toBeNull();
});

it("shows the week and prompts in the user's own wording", async () => {
	render(
		<JournalInsights
			host={new MemoryHost()}
			today={day}
			notes={notes}
			tasks={tasks}
		/>,
	);
	expect(
		screen.getByRole("region", { name: "This week" }).textContent,
	).toContain("Tasks done1");
	expect(screen.getByText("Overdue tasks waiting: 1.")).toBeTruthy();
	act(() => {
		settings.set("planner.journal.prompt.overdue", "Overdue: {count}!");
	});
	expect(screen.getByText("Overdue: 1!")).toBeTruthy();
	act(() => {
		settings.set("planner.journal.weeklyReview", false);
		settings.set("planner.journal.prompts", false);
	});
	expect(screen.queryByRole("region", { name: "This week" })).toBeNull();
	expect(screen.queryByText("Overdue: 1!")).toBeNull();
});
