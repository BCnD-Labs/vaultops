// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import type { PlannerTask } from "../../core/planner/rules";
import { LogTaskLists, LogWeekStrip, RecentLogs } from "./LogParts";

afterEach(cleanup);

const task = (o: Partial<PlannerTask>): PlannerTask => ({
	path: "Planner/a.vnote",
	number: 1,
	title: "A",
	status: "open",
	kind: "task",
	starred: false,
	labels: [],
	preview: "",
	...o,
});

it("week strip marks logged days, opens a day and moves by a week", async () => {
	const onDate = vi.fn();
	render(
		<LogWeekStrip
			date="2026-11-05"
			today="2026-11-05"
			logged={new Set(["2026-11-03"])}
			onDate={onDate}
		/>,
	);
	expect(screen.getAllByRole("button", { name: /has a log/ })).toHaveLength(1);
	await userEvent.click(screen.getByRole("button", { name: /Nov 3/ }));
	expect(onDate).toHaveBeenLastCalledWith("2026-11-03");
	await userEvent.click(screen.getByRole("button", { name: "Next week" }));
	expect(onDate).toHaveBeenLastCalledWith("2026-11-12");
	await userEvent.click(screen.getByRole("button", { name: "Previous week" }));
	expect(onDate).toHaveBeenLastCalledWith("2026-10-29");
});

it("lists completed and due tasks and opens one", async () => {
	const onOpen = vi.fn();
	const done = task({
		path: "Planner/d.vnote",
		number: 2,
		title: "Done one",
		status: "closed",
		closedAt: "2026-11-05",
	});
	const due = task({
		path: "Planner/u.vnote",
		number: 3,
		title: "Due one",
		due: "2026-11-05",
	});
	render(
		<LogTaskLists date="2026-11-05" tasks={[done, due]} onOpen={onOpen} />,
	);
	expect(screen.getByText("Completed")).toBeTruthy();
	expect(screen.getByText("Due")).toBeTruthy();
	await userEvent.click(screen.getByRole("button", { name: /Due one/ }));
	expect(onOpen).toHaveBeenCalledWith(due);
});

it("shows nothing when there is nothing to list", () => {
	const { container } = render(
		<LogTaskLists date="2026-11-05" tasks={[]} onOpen={() => {}} />,
	);
	expect(container.firstChild).toBeNull();
	const r = render(
		<RecentLogs entries={[]} date="2026-11-05" onDate={() => {}} />,
	);
	expect(r.container.firstChild).toBeNull();
});

it("recent entries open their day", async () => {
	const onDate = vi.fn();
	render(
		<RecentLogs
			entries={[
				{
					day: "2026-11-03",
					path: "Journal/2026-11-03.vnote",
					preview: "Shipped it",
				},
			]}
			date="2026-11-05"
			onDate={onDate}
		/>,
	);
	await userEvent.click(screen.getByRole("button", { name: /Shipped it/ }));
	expect(onDate).toHaveBeenCalledWith("2026-11-03");
});

it("week strip starts on Monday when the setting says so", () => {
	localStorage.setItem(
		"vaultops.settings",
		JSON.stringify({ "planner.weekStartsOn": "monday" }),
	);
	try {
		render(
			<LogWeekStrip
				date="2026-11-05"
				today="2026-11-05"
				logged={new Set()}
				onDate={() => {}}
			/>,
		);
		const first = screen.getAllByRole("button", {
			name: /^[A-Z][a-z]{2} \d/,
		})[0];
		expect(first?.getAttribute("aria-label")).toMatch(/Nov 2/);
	} finally {
		localStorage.clear();
	}
});
