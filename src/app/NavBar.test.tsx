// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { NavBar } from "./NavBar";

afterEach(cleanup);

function setup(over: Partial<Parameters<typeof NavBar>[0]> = {}) {
	const onBack = vi.fn();
	const onForward = vi.fn();
	render(
		<TooltipProvider>
			<NavBar
				vault="Vault"
				path="Class/Week 1/Lecture.vnote"
				title="Lecture"
				canGoBack
				canGoForward={false}
				onBack={onBack}
				onForward={onForward}
				{...over}
			/>
		</TooltipProvider>,
	);
	return { onBack, onForward };
}

it("shows the folder and title, and steps back but not forward when only back is possible", async () => {
	const { onBack, onForward } = setup();
	expect(screen.getByText("Class/Week 1")).toBeTruthy();
	expect(screen.getByText("Lecture")).toBeTruthy();
	const user = userEvent.setup();
	await user.click(screen.getByRole("button", { name: "Back" }));
	expect(onBack).toHaveBeenCalledTimes(1);
	const forward = screen.getByRole("button", {
		name: "Forward",
	}) as HTMLButtonElement;
	expect(forward.disabled).toBe(true);
	await user.click(forward);
	expect(onForward).not.toHaveBeenCalled();
});

it("shows the vault name when no note is open, and disables both steps", () => {
	setup({ path: null, title: null, canGoBack: false });
	expect(screen.getByText("Vault")).toBeTruthy();
	for (const name of ["Back", "Forward"])
		expect(
			(screen.getByRole("button", { name }) as HTMLButtonElement).disabled,
		).toBe(true);
});

it("leaves room for the floating sidebar toggles", () => {
	setup({
		clearLeftToggle: true,
		clearRightToggle: true,
	});
	expect(
		document.querySelector(".nav-bar")?.hasAttribute("data-clear-toggle"),
	).toBe(true);
	const buttons = screen
		.getAllByRole("button")
		.map((b) => b.textContent || b.getAttribute("aria-label"));
	expect(buttons).toEqual(["Back", "Forward"]);
	expect(
		document.querySelector(".nav-bar")?.hasAttribute("data-clear-right-toggle"),
	).toBe(true);
});

it("has no reading toggle or more menu until a note offers one", () => {
	setup();
	expect(screen.queryByRole("button", { name: /reading view/ })).toBeNull();
	expect(screen.queryByRole("button", { name: "More options" })).toBeNull();
});

it("toggles reading view from the button and from the more menu, and copies the path", async () => {
	const onToggleReading = vi.fn();
	const writeText = vi.fn().mockResolvedValue(undefined);
	setup({ onToggleReading });
	const user = userEvent.setup();
	// user-event installs its own clipboard; replace it after setup.
	vi.stubGlobal("navigator", { clipboard: { writeText } });
	await user.click(
		screen.getByRole("button", { name: "Switch to reading view" }),
	);
	expect(onToggleReading).toHaveBeenCalledTimes(1);
	await user.click(screen.getByRole("button", { name: "More options" }));
	await user.click(
		await screen.findByRole("menuitem", { name: "Copy file path" }),
	);
	expect(writeText).toHaveBeenCalledWith("Class/Week 1/Lecture.vnote");
	await user.click(screen.getByRole("button", { name: "More options" }));
	await user.click(
		await screen.findByRole("menuitem", { name: "Switch to reading view" }),
	);
	expect(onToggleReading).toHaveBeenCalledTimes(2);
	vi.unstubAllGlobals();
});

it("offers to switch back to editing while reading", () => {
	setup({ reading: true, onToggleReading: vi.fn() });
	expect(
		screen.getByRole("button", { name: "Switch to editing view" }),
	).toBeTruthy();
});

it("shows only where the note lives when it has no controls, and no calendar button on request", () => {
	setup({ controls: false, calendar: false, onToggleReading: () => {} });
	expect(screen.getByText("Lecture")).toBeTruthy();
	for (const name of [
		"Back",
		"Forward",
		"Switch to reading view",
		"More options",
		"Calendar",
	])
		expect(screen.queryByRole("button", { name })).toBeNull();
});
