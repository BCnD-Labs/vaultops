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

it("shows a collapsed sidebar's button at its own end of the bar", () => {
	setup({
		leftToggle: <button type="button">Show left</button>,
		rightToggle: <button type="button">Show right</button>,
	});
	const buttons = screen
		.getAllByRole("button")
		.map((b) => b.textContent || b.getAttribute("aria-label"));
	expect(buttons).toEqual(["Show left", "Back", "Forward", "Show right"]);
});
