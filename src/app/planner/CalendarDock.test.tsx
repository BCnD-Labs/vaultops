// @vitest-environment happy-dom
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MemoryHost } from "../../host/memory-host";
import { SettingsScreen } from "../SettingsScreen";
import {
	CalendarGroup,
	DockZone,
	TOOL_DRAG_TYPE,
	ToolDragProvider,
} from "./CalendarDock";
import { PlannerProvider } from "./PlannerContext";
import { PlannerPanel } from "./PlannerPanel";

afterEach(() => {
	cleanup();
	localStorage.clear();
});

function Planner() {
	return (
		<TooltipProvider>
			<PlannerProvider
				notes={[]}
				host={new MemoryHost()}
				writable
				onChanged={async () => {}}
				onOpenNote={() => {}}
				onOpenScreen={() => {}}
			>
				<ToolDragProvider>
					<div data-testid="right">
						<PlannerPanel />
						<CalendarGroup side="right" />
						<DockZone side="right" />
					</div>
					<div data-testid="left">
						<CalendarGroup side="left" />
						<DockZone side="left" />
					</div>
					<SettingsScreen host={new MemoryHost()} />
				</ToolDragProvider>
			</PlannerProvider>
		</TooltipProvider>
	);
}
const inSidebar = () => localStorage.setItem("vaultops:calendar-button", "0");
const transfer = () => {
	const data: Record<string, string> = {};
	return {
		types: [TOOL_DRAG_TYPE],
		setData: (type: string, value: string) => {
			data[type] = value;
		},
		getData: (type: string) => data[type] ?? "",
		effectAllowed: "",
		dropEffect: "",
	};
};
const tick = () =>
	act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 5));
	});

it("keeps the calendar in the planner by default, with Tasks under it", () => {
	inSidebar();
	render(<Planner />);
	const planner = screen.getByRole("region", { name: "Planner" });
	expect(planner.querySelector('[aria-label="Calendar"]')).toBeTruthy();
	expect(screen.getByRole("button", { name: "Tasks" })).toBeTruthy();
	expect(screen.queryByRole("button", { name: "Log" })).toBeNull();
	expect(screen.queryByRole("region", { name: "Calendar group" })).toBeNull();
});

it("moves the calendar below the right or left sidebar, still one calendar", async () => {
	inSidebar();
	const user = userEvent.setup();
	render(<Planner />);
	await user.click(screen.getByRole("button", { name: "Move the calendar" }));
	await user.click(
		await screen.findByRole("menuitemradio", {
			name: "Right sidebar, below the tools",
		}),
	);
	const planner = screen.getByRole("region", { name: "Planner" });
	// Planner is just Tasks; the calendar sits below it in its own group.
	expect(planner.querySelector('[aria-label="Calendar"]')).toBeNull();
	const names = Array.from(planner.querySelectorAll(".planner-section")).map(
		(s) => s.getAttribute("aria-label"),
	);
	expect(names).toEqual(["Tasks"]);
	expect(screen.getByTestId("right").querySelector(".dock-group")).toBeTruthy();
	await user.click(screen.getByRole("button", { name: "Move the calendar" }));
	await user.click(
		await screen.findByRole("menuitemradio", {
			name: "Left sidebar, below the files",
		}),
	);
	expect(screen.getByTestId("right").querySelector(".dock-group")).toBeNull();
	expect(screen.getByTestId("left").querySelector(".dock-group")).toBeTruthy();
	expect(localStorage.getItem("vaultops:calendar-dock")).toBe("left");
});

it("moves the calendar by dragging its tab to a sidebar's drop zone", async () => {
	inSidebar();
	render(<Planner />);
	const head = screen
		.getByRole("button", { name: "Calendar" })
		.closest(".planner-section-head") as HTMLElement;
	expect(head.getAttribute("draggable")).toBe("true");
	expect(screen.queryByTestId("dock-zone-right")).toBeNull();
	const dataTransfer = transfer();
	fireEvent.dragStart(head, { dataTransfer });
	await tick();
	// The zone for where it already is stays away; the others appear.
	const zone = screen.getByTestId("dock-zone-left");
	fireEvent.dragOver(zone, { dataTransfer });
	expect(zone.hasAttribute("data-over")).toBe(true);
	fireEvent.drop(zone, { dataTransfer });
	expect(screen.getByTestId("left").querySelector(".dock-group")).toBeTruthy();
	expect(screen.queryByTestId("dock-zone-left")).toBeNull();
});

it("puts the calendar back into the planner by dragging its tab onto it", async () => {
	inSidebar();
	localStorage.setItem("vaultops:calendar-dock", "right");
	render(<Planner />);
	const tab = screen.getByRole("tab", { name: "Calendar" });
	const dataTransfer = transfer();
	fireEvent.dragStart(tab, { dataTransfer });
	await tick();
	fireEvent.drop(screen.getByTestId("dock-zone-planner"), { dataTransfer });
	expect(screen.getByTestId("right").querySelector(".dock-group")).toBeNull();
	expect(
		screen
			.getByRole("region", { name: "Planner" })
			.querySelector(".planner-section-head"),
	).toBeTruthy();
});

it("shows the calendar in the title bar or in a sidebar, never both", async () => {
	const user = userEvent.setup();
	render(<Planner />);
	// Default is the title bar: no calendar in the planner or any group.
	expect(
		screen
			.getByRole("region", { name: "Planner" })
			.querySelector('[aria-label="Calendar"]'),
	).toBeNull();
	expect(
		screen
			.getByRole("radio", { name: "Title bar" })
			.getAttribute("aria-checked"),
	).toBe("true");
	await user.click(screen.getByRole("radio", { name: "Sidebar" }));
	expect(
		screen
			.getByRole("region", { name: "Planner" })
			.querySelector('[aria-label="Calendar"]'),
	).toBeTruthy();
	// Choosing the same place again keeps it.
	await user.click(screen.getByRole("radio", { name: "Sidebar" }));
	expect(
		screen.getByRole("radio", { name: "Sidebar" }).getAttribute("aria-checked"),
	).toBe("true");
	await user.click(screen.getByRole("radio", { name: "Title bar" }));
	expect(screen.queryByRole("region", { name: "Calendar group" })).toBeNull();
});
