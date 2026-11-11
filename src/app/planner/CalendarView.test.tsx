// @vitest-environment happy-dom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlannerTask } from "../../core/planner/rules";
import { Agenda, CalendarView } from "./CalendarView";
import { fmtDay, fmtShort } from "./fmt";

afterEach(cleanup);

// 2026-11-07 is a Saturday, so its week runs Sun 11-01 to Sat 11-07.
const TODAY = "2026-11-07";

const task = (over: Partial<PlannerTask> & { path: string }): PlannerTask => ({
	number: 1,
	title: over.path,
	status: "open",
	kind: "task",
	starred: false,
	labels: [],
	preview: "",
	...over,
});

function setup(
	tasks: PlannerTask[] = [],
	over: Partial<
		Omit<
			React.ComponentProps<typeof CalendarView>,
			"onDate" | "onSelect" | "onAdd"
		>
	> = {},
) {
	const props = {
		date: TODAY,
		today: TODAY,
		tasks,
		loggedDays: new Set<string>(),
		selected: null,
		writable: true,
		onDate: vi.fn(),
		onSelect: vi.fn(),
		onAdd: vi.fn(),
		...over,
	};
	const view = render(<CalendarView {...props} />);
	return { ...props, view };
}
const chooseView = (name: "Day" | "Week" | "Month") =>
	userEvent.click(screen.getByRole("tab", { name }));

describe("CalendarView navigation", () => {
	it("starts on the week view and shows the week range as the title", () => {
		setup();
		expect(
			screen.getByRole("tab", { name: "Week" }).getAttribute("aria-selected"),
		).toBe("true");
		expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(
			`${fmtShort("2026-11-01")} – ${fmtShort("2026-11-07")}`,
		);
		expect(document.querySelectorAll(".plan-week-date")).toHaveLength(7);
	});

	it("moves by a week, a day or a month depending on the view", async () => {
		const p = setup();
		await userEvent.click(screen.getByRole("button", { name: "Next week" }));
		expect(p.onDate).toHaveBeenLastCalledWith("2026-11-14");
		await userEvent.click(
			screen.getByRole("button", { name: "Previous week" }),
		);
		expect(p.onDate).toHaveBeenLastCalledWith("2026-10-31");
		await chooseView("Day");
		await userEvent.click(screen.getByRole("button", { name: "Next day" }));
		expect(p.onDate).toHaveBeenLastCalledWith("2026-11-08");
		await chooseView("Month");
		await userEvent.click(screen.getByRole("button", { name: "Next month" }));
		expect(p.onDate).toHaveBeenLastCalledWith("2026-12-07");
		await userEvent.click(
			screen.getByRole("button", { name: "Previous month" }),
		);
		expect(p.onDate).toHaveBeenLastCalledWith("2026-10-07");
	});

	it("month navigation clamps the 31st to the end of a shorter month", async () => {
		const p = setup([], { date: "2026-10-31" });
		await chooseView("Month");
		await userEvent.click(screen.getByRole("button", { name: "Next month" }));
		expect(p.onDate).toHaveBeenLastCalledWith("2026-11-30");
	});

	it("Today jumps to the today key", async () => {
		const p = setup([], { date: "2026-03-01" });
		await userEvent.click(screen.getByRole("button", { name: "Today" }));
		expect(p.onDate).toHaveBeenCalledWith(TODAY);
	});

	it("day view shows one column and a day title", async () => {
		setup();
		await chooseView("Day");
		expect(document.querySelectorAll(".plan-week-date")).toHaveLength(1);
		expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(
			fmtDay(TODAY),
		);
	});

	it("selecting a date calls onDate and marks today and the selected day", async () => {
		const p = setup([], { date: "2026-11-05" });
		const buttons = [
			...document.querySelectorAll<HTMLButtonElement>(".plan-week-date"),
		];
		const selected = buttons.find((b) => b.dataset.planDate === "2026-11-05");
		const todayButton = buttons.find((b) => b.dataset.planDate === TODAY);
		expect(selected?.getAttribute("aria-pressed")).toBe("true");
		expect(selected?.tabIndex).toBe(0);
		expect(todayButton?.className).toContain("is-today");
		expect(todayButton?.tabIndex).toBe(-1);
		await userEvent.click(todayButton as HTMLButtonElement);
		expect(p.onDate).toHaveBeenCalledWith(TODAY);
	});

	it("arrow keys move the date by a day or a week and move focus there", async () => {
		const requestFrame = vi
			.spyOn(window, "requestAnimationFrame")
			.mockImplementation((cb) => {
				cb(0);
				return 0;
			});
		const p = setup([], { date: "2026-11-04" });
		const focusOn = (key: string) =>
			(
				document.querySelector(`[data-plan-date="${key}"]`) as HTMLElement
			).focus();
		focusOn("2026-11-04");
		await userEvent.keyboard("{ArrowRight}");
		expect(p.onDate).toHaveBeenLastCalledWith("2026-11-05");
		expect(document.activeElement).toBe(
			document.querySelector('[data-plan-date="2026-11-05"]'),
		);
		focusOn("2026-11-04");
		await userEvent.keyboard("{ArrowLeft}");
		expect(p.onDate).toHaveBeenLastCalledWith("2026-11-03");
		focusOn("2026-11-04");
		await userEvent.keyboard("{ArrowDown}");
		expect(p.onDate).toHaveBeenLastCalledWith("2026-11-11");
		focusOn("2026-11-04");
		await userEvent.keyboard("{ArrowUp}");
		expect(p.onDate).toHaveBeenLastCalledWith("2026-10-28");
		const calls = p.onDate.mock.calls.length;
		focusOn("2026-11-04");
		await userEvent.keyboard("a");
		expect(p.onDate.mock.calls.length).toBe(calls);
		requestFrame.mockRestore();
	});
});

describe("CalendarView week and day content", () => {
	it("puts an untimed task in the all-day row and a timed one in the grid", () => {
		setup([
			task({ path: "a", title: "Hand in essay", due: "2026-11-05" }),
			task({
				path: "b",
				title: "Study group",
				kind: "event",
				scheduledDate: "2026-11-05",
				scheduledTime: "10:00",
				durationMinutes: 90,
			}),
		]);
		const allDay = document.querySelector(".plan-allday") as HTMLElement;
		expect(within(allDay).getByText("Hand in essay")).toBeTruthy();
		expect(within(allDay).queryByText("Study group")).toBeNull();
		const timed = document.querySelector(".plan-timed-event") as HTMLElement;
		expect(timed.textContent).toContain("Study group");
		expect(timed.textContent).toContain("10:00 · 90m");
		expect(timed.style.top).toBe(`${((10 * 60) / 60) * 44}px`);
		expect(timed.style.height).toBe(`${(90 / 60) * 44 - 2}px`);
	});

	it("a task due on a day it is not scheduled on also shows as a deadline there", () => {
		setup([
			task({
				path: "a",
				title: "Draft",
				scheduledDate: "2026-11-02",
				scheduledTime: "09:00",
				due: "2026-11-06",
			}),
		]);
		const allDay = document.querySelector(".plan-allday") as HTMLElement;
		expect(within(allDay).getByText("Draft")).toBeTruthy();
		expect(within(allDay).getByText("Due:")).toBeTruthy();
		expect(document.querySelectorAll(".plan-timed-event")).toHaveLength(1);
	});

	it("overlapping timed events share the width side by side", () => {
		setup([
			task({
				path: "a",
				title: "One",
				due: "2026-11-05",
				dueTime: "09:00",
				durationMinutes: 60,
			}),
			task({
				path: "b",
				title: "Two",
				due: "2026-11-05",
				dueTime: "09:30",
				durationMinutes: 60,
			}),
		]);
		const events = [
			...document.querySelectorAll<HTMLElement>(".plan-timed-event"),
		];
		expect(events).toHaveLength(2);
		expect(events.map((e) => e.style.width)).toEqual(["50%", "50%"]);
		expect(events.map((e) => e.style.left)).toEqual(["0%", "50%"]);
	});

	it("a short event keeps a minimum height", () => {
		setup([
			task({ path: "a", title: "Quick", due: "2026-11-05", dueTime: "09:00" }),
		]);
		const el = document.querySelector(".plan-timed-event") as HTMLElement;
		expect(Number.parseFloat(el.style.height)).toBeGreaterThanOrEqual(18);
	});

	it("marks done tasks and the selected one, and reports clicks", async () => {
		const p = setup(
			[
				task({ path: "a", title: "Old", due: "2026-11-05", status: "closed" }),
				task({ path: "b", title: "New", due: "2026-11-05" }),
			],
			{ selected: "b" },
		);
		const old = screen.getByText("Old").closest("button") as HTMLElement;
		const fresh = screen.getByText("New").closest("button") as HTMLElement;
		expect(old.className).toContain("is-done");
		expect(fresh.className).toContain("is-active");
		expect(fresh.getAttribute("aria-pressed")).toBe("true");
		await userEvent.click(old);
		expect(p.onSelect).toHaveBeenCalledWith(
			expect.objectContaining({ path: "a" }),
		);
	});

	it("an hour cell adds at that time and is absent when read-only", async () => {
		const p = setup();
		await userEvent.click(
			screen.getAllByRole("button", {
				name: `Add on ${fmtShort(TODAY)} at 14:00`,
			})[0] as HTMLElement,
		);
		expect(p.onAdd).toHaveBeenCalledWith(TODAY, "14:00");
		cleanup();
		setup([], { writable: false });
		expect(document.querySelectorAll(".plan-hour-cell")).toHaveLength(0);
	});

	it("renders 24 hour labels and scrolls to the morning", () => {
		setup();
		expect(document.querySelectorAll(".plan-hours span")).toHaveLength(24);
		expect(
			(document.querySelector(".plan-time-scroll") as HTMLElement).scrollTop,
		).toBe(7 * 44);
	});
});

describe("CalendarView month view", () => {
	it("shows whole weeks and fades days outside the month", async () => {
		setup();
		await chooseView("Month");
		const days = document.querySelectorAll(".plan-month-day");
		expect(days.length % 7).toBe(0);
		expect(
			document.querySelectorAll(".plan-month-day.is-outside").length,
		).toBeGreaterThan(0);
		expect(document.querySelector(".plan-month-day.is-today")).toBeTruthy();
		expect(document.querySelectorAll(".plan-month-labels span")).toHaveLength(
			7,
		);
	});

	it("names a day with its item count and shows up to three chips", async () => {
		setup([
			task({ path: "a", title: "A", due: "2026-11-05" }),
			task({ path: "b", title: "B", due: "2026-11-05" }),
			task({ path: "c", title: "C", due: "2026-11-05" }),
		]);
		await chooseView("Month");
		const cell = document.querySelector(
			'[data-plan-date="2026-11-05"]',
		) as HTMLElement;
		expect(cell.getAttribute("aria-label")).toBe(
			`${fmtDay("2026-11-05")}, 3 items`,
		);
		const box = cell.closest(".plan-month-day") as HTMLElement;
		expect(box.querySelectorAll(".plan-event")).toHaveLength(3);
		expect(within(box).queryByText(/more$/)).toBeNull();
	});

	it("with four items shows two chips and '+2 more' which opens that day", async () => {
		const p = setup(
			["a", "b", "c", "d"].map((id) =>
				task({ path: id, title: id.toUpperCase(), due: "2026-11-05" }),
			),
		);
		await chooseView("Month");
		const box = document
			.querySelector('[data-plan-date="2026-11-05"]')
			?.closest(".plan-month-day") as HTMLElement;
		expect(box.querySelectorAll(".plan-event")).toHaveLength(2);
		await userEvent.click(within(box).getByRole("button", { name: "+2 more" }));
		expect(p.onDate).toHaveBeenCalledWith("2026-11-05");
		expect(
			screen.getByRole("tab", { name: "Day" }).getAttribute("aria-selected"),
		).toBe("true");
	});

	it("shows a single item in singular and none without a count", async () => {
		setup([task({ path: "a", title: "A", due: "2026-11-05" })]);
		await chooseView("Month");
		expect(
			document
				.querySelector('[data-plan-date="2026-11-05"]')
				?.getAttribute("aria-label"),
		).toBe(`${fmtDay("2026-11-05")}, 1 item`);
		expect(
			document
				.querySelector('[data-plan-date="2026-11-04"]')
				?.getAttribute("aria-label"),
		).toBe(fmtDay("2026-11-04"));
	});

	it("draws dots by state: done, overdue, open", async () => {
		setup([
			task({
				path: "a",
				title: "A",
				due: "2026-11-03",
				status: "closed",
				closedAt: "2026-11-03T08:00:00Z",
			}),
			task({ path: "b", title: "B", due: "2026-11-03" }),
			task({ path: "c", title: "C", due: "2026-11-09" }),
		]);
		await chooseView("Month");
		const dotsOn = (key: string) => {
			const cell = document
				.querySelector(`[data-plan-date="${key}"]`)
				?.closest(".plan-month-day");
			return [...(cell?.querySelectorAll(".plan-dot") ?? [])].map((d) =>
				d.className.replace("plan-dot ", ""),
			);
		};
		expect(dotsOn("2026-11-03")).toEqual(["is-done", "is-overdue"]);
		expect(dotsOn("2026-11-09")).toEqual(["is-open"]);
	});

	it("shows the Log marker and the closed count on a day", async () => {
		setup(
			[
				task({
					path: "a",
					title: "A",
					due: "2026-11-03",
					status: "closed",
					closedAt: "2026-11-03T08:00:00Z",
				}),
			],
			{ loggedDays: new Set(["2026-11-03", "2026-11-04"]) },
		);
		await chooseView("Month");
		const meta = (key: string) =>
			document
				.querySelector(`[data-plan-date="${key}"]`)
				?.closest(".plan-month-day")
				?.querySelector(".plan-day-meta");
		expect(meta("2026-11-03")?.textContent).toBe("Log · 1");
		expect(meta("2026-11-03")?.getAttribute("title")).toBe(
			"Daily log written · 1 closed",
		);
		expect(meta("2026-11-04")?.textContent).toBe("Log");
		expect(meta("2026-11-05")).toBeNull();
	});

	it("shows only the closed count on a day that has closed tasks but no log", async () => {
		setup([
			task({
				path: "a",
				title: "A",
				due: "2026-11-06",
				status: "closed",
				closedAt: "2026-11-06T08:00:00Z",
			}),
		]);
		await chooseView("Month");
		const meta = document
			.querySelector('[data-plan-date="2026-11-06"]')
			?.closest(".plan-month-day")
			?.querySelector(".plan-day-meta");
		expect(meta?.textContent).toBe("1");
		expect(meta?.getAttribute("title")).toBe("1 closed");
	});

	it("each day has an add button only when writable", async () => {
		const p = setup();
		await chooseView("Month");
		await userEvent.click(
			screen.getAllByRole("button", {
				name: `Add on ${fmtShort("2026-11-05")}`,
			})[0] as HTMLElement,
		);
		expect(p.onAdd).toHaveBeenCalledWith("2026-11-05");
		cleanup();
		setup([], { writable: false });
		await chooseView("Month");
		expect(document.querySelectorAll(".plan-add-day")).toHaveLength(0);
	});

	it("shows the agenda for the selected date under the month", async () => {
		setup([task({ path: "a", title: "Agenda item", due: "2026-11-07" })]);
		await chooseView("Month");
		const agenda = screen.getByRole("region", {
			name: `Items on ${fmtDay(TODAY)}`,
		});
		expect(within(agenda).getByText("Agenda item")).toBeTruthy();
		expect(within(agenda).getByText("1 item")).toBeTruthy();
	});
});

describe("Agenda", () => {
	it("says when nothing is scheduled and offers add when writable", async () => {
		const onAdd = vi.fn();
		render(
			<Agenda
				date={TODAY}
				tasks={[]}
				selected={null}
				writable
				onSelect={() => {}}
				onAdd={onAdd}
			/>,
		);
		expect(screen.getByText("Nothing scheduled")).toBeTruthy();
		expect(screen.queryByRole("list")).toBeNull();
		await userEvent.click(
			screen.getByRole("button", { name: `Add on ${fmtShort(TODAY)}` }),
		);
		expect(onAdd).toHaveBeenCalledWith(TODAY);
	});

	it("has no add button when read-only and pluralises the count", () => {
		render(
			<Agenda
				date={TODAY}
				tasks={[
					task({ path: "a", title: "A", due: TODAY }),
					task({ path: "b", title: "B", due: TODAY }),
				]}
				selected={null}
				writable={false}
				onSelect={() => {}}
				onAdd={() => {}}
			/>,
		);
		expect(screen.getByText("2 items")).toBeTruthy();
		expect(screen.queryByRole("button", { name: /^Add on/ })).toBeNull();
	});
});

it("month view starts its weeks on Monday when the setting says so", async () => {
	localStorage.setItem(
		"vaultops.settings",
		JSON.stringify({ "planner.weekStartsOn": "monday" }),
	);
	try {
		const { view } = setup();
		await chooseView("Month");
		const labels = view.container.querySelector(".plan-month-labels");
		expect(labels?.textContent?.startsWith("Mon")).toBe(true);
	} finally {
		localStorage.clear();
	}
});
