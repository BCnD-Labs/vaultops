// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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
import { NavBar } from "../NavBar";
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
					<NavBar
						vault="Vault"
						path="Note.vnote"
						title="Note"
						canGoBack={false}
						canGoForward={false}
						onBack={() => {}}
						onForward={() => {}}
					/>
					<div data-testid="right">
						<PlannerPanel />
						<CalendarGroup side="right" />
						<DockZone side="right" />
					</div>
					<SettingsScreen host={new MemoryHost()} initialSection="interface" />
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

it("keeps the calendar in the planner by default, with Today's log and Tasks under it", () => {
	inSidebar();
	render(<Planner />);
	const planner = screen.getByRole("region", { name: "Planner" });
	expect(planner.querySelector('[aria-label="Calendar"]')).toBeTruthy();
	expect(screen.getByRole("button", { name: "Today's log" })).toBeTruthy();
	expect(screen.getByRole("button", { name: "Tasks" })).toBeTruthy();
	expect(screen.queryByRole("region", { name: "Calendar group" })).toBeNull();
});

it("moves the calendar below the right sidebar's tools, still one calendar", async () => {
	inSidebar();
	const user = userEvent.setup();
	render(<Planner />);
	await user.click(screen.getByRole("button", { name: "Calendar options" }));
	await user.click(
		await screen.findByRole("menuitemradio", { name: "Below the tools" }),
	);
	const planner = screen.getByRole("region", { name: "Planner" });
	// Planner is Today's log and Tasks; the calendar sits below it in its own group.
	expect(planner.querySelector('[aria-label="Calendar"]')).toBeNull();
	const names = Array.from(planner.querySelectorAll(".planner-section")).map(
		(s) => s.getAttribute("aria-label"),
	);
	expect(names).toEqual(["Today's log", "Tasks"]);
	expect(screen.getByTestId("right").querySelector(".dock-group")).toBeTruthy();
	expect(localStorage.getItem("vaultops:calendar-dock")).toBe("right");
});

it("has no left sidebar place any more, and a saved left falls back to the planner", async () => {
	inSidebar();
	localStorage.setItem("vaultops:calendar-dock", "left");
	const user = userEvent.setup();
	render(<Planner />);
	// The calendar is in the planner, not in a group.
	expect(
		screen
			.getByRole("region", { name: "Planner" })
			.querySelector('[aria-label="Calendar"]'),
	).toBeTruthy();
	await user.click(screen.getByRole("button", { name: "Calendar options" }));
	const places = (await screen.findAllByRole("menuitemradio")).map(
		(item) => item.textContent,
	);
	expect(places).toEqual(["In the planner", "Below the tools"]);
});

it("puts the calendar in the title bar from its own options button", async () => {
	inSidebar();
	const user = userEvent.setup();
	render(<Planner />);
	await user.click(screen.getByRole("button", { name: "Calendar options" }));
	const toggle = await screen.findByRole("menuitemcheckbox", {
		name: "Show in the title bar",
	});
	expect(toggle.getAttribute("aria-checked")).toBe("false");
	await user.click(toggle);
	// Gone from the sidebar, and Settings agrees.
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
	expect(localStorage.getItem("vaultops:calendar-button")).toBe("1");
});

it("moves the calendar by dragging its tab to the sidebar's drop zone", async () => {
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
	const zone = screen.getByTestId("dock-zone-right");
	fireEvent.dragOver(zone, { dataTransfer });
	expect(zone.hasAttribute("data-over")).toBe(true);
	fireEvent.drop(zone, { dataTransfer });
	expect(screen.getByTestId("right").querySelector(".dock-group")).toBeTruthy();
	expect(screen.queryByTestId("dock-zone-right")).toBeNull();
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

it("lets the title-bar calendar go back to the sidebar from its own options button", async () => {
	const user = userEvent.setup();
	render(<Planner />);
	// The default is the title bar, so there is no calendar in the sidebar yet.
	const [opener] = screen.getAllByRole("button", { name: "Calendar" });
	await user.click(opener as HTMLElement);
	await user.click(
		await screen.findByRole("button", { name: "Calendar options" }),
	);
	const toggle = await screen.findByRole("menuitemcheckbox", {
		name: "Show in the title bar",
	});
	expect(toggle.getAttribute("aria-checked")).toBe("true");
	// Placement only makes sense in a sidebar.
	expect(
		screen.queryByRole("menuitemradio", { name: "In the planner" }),
	).toBeNull();
	await user.click(toggle);
	expect(localStorage.getItem("vaultops:calendar-button")).toBe("0");
	expect(
		screen
			.getByRole("region", { name: "Planner" })
			.querySelector('[aria-label="Calendar"]'),
	).toBeTruthy();
});

it("shows the calendar where each setting says, and still does after a restart", async () => {
	const css = readFileSync(
		resolve(process.cwd(), "src/app/planner/planner.css"),
		"utf8",
	);
	expect(css).not.toMatch(/\.calendar-reveal/);
	const user = userEvent.setup();
	const titleBarButton = () =>
		document.querySelector<HTMLElement>(
			'.nav-bar button[aria-label="Calendar"]',
		);
	const plannerCalendar = () =>
		screen
			.getByRole("region", { name: "Planner" })
			.querySelector('[aria-label="Calendar"]');
	const dockedCalendar = () =>
		screen.queryByRole("region", { name: "Calendar group" });

	render(<Planner />);
	// Title bar setting (default): visible in the title bar, nowhere in the sidebar.
	expect(titleBarButton()).toBeTruthy();
	expect(plannerCalendar()).toBeNull();
	expect(dockedCalendar()).toBeNull();

	// Switch to sidebar (in the planner), then back to title bar, and restart.
	await user.click(screen.getByRole("radio", { name: "Sidebar" }));
	expect(titleBarButton()).toBeNull();
	expect(plannerCalendar()).toBeTruthy();
	expect(dockedCalendar()).toBeNull();

	cleanup();
	render(<Planner />);
	expect(titleBarButton()).toBeNull();
	expect(plannerCalendar()).toBeTruthy();
	expect(dockedCalendar()).toBeNull();

	// Sidebar -> Below the tools, and restart.
	await user.click(screen.getByRole("radio", { name: "Below the tools" }));
	expect(titleBarButton()).toBeNull();
	expect(plannerCalendar()).toBeNull();
	expect(dockedCalendar()).toBeTruthy();

	cleanup();
	render(<Planner />);
	expect(titleBarButton()).toBeNull();
	expect(plannerCalendar()).toBeNull();
	expect(dockedCalendar()).toBeTruthy();

	// Title bar again, and restart: button is in the title bar and opens the popover.
	await user.click(screen.getByRole("radio", { name: "Title bar" }));
	expect(titleBarButton()).toBeTruthy();
	expect(plannerCalendar()).toBeNull();
	expect(dockedCalendar()).toBeNull();

	cleanup();
	render(<Planner />);
	const opener = titleBarButton();
	expect(opener).toBeTruthy();
	expect(plannerCalendar()).toBeNull();
	expect(dockedCalendar()).toBeNull();
	await user.click(opener as HTMLElement);
	expect(
		await screen.findByRole("button", { name: "Open planner" }),
	).toBeTruthy();
});
