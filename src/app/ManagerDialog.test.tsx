// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { ManagerDialog, messageOf, useDiscardGuard } from "./ManagerDialog";

afterEach(cleanup);

function Harness({
	dirty,
	action,
	onDiscard,
}: {
	dirty: boolean;
	action: () => void;
	onDiscard?: () => void;
}) {
	const { guard, dialog } = useDiscardGuard(dirty, {
		title: "Discard your changes?",
		description: "Going on will drop them.",
		confirmLabel: "Discard changes",
		cancelLabel: "Keep editing",
		onDiscard,
	});
	return (
		<>
			<button type="button" onClick={() => guard(action)}>
				Go
			</button>
			{dialog}
		</>
	);
}

it("runs the action at once when nothing is dirty", async () => {
	const action = vi.fn();
	render(<Harness dirty={false} action={action} />);
	await userEvent.click(screen.getByRole("button", { name: "Go" }));
	expect(action).toHaveBeenCalledTimes(1);
	expect(screen.queryByText("Discard your changes?")).toBeNull();
});

it("asks first when dirty, and Keep editing leaves the action unrun", async () => {
	const action = vi.fn();
	const onDiscard = vi.fn();
	render(<Harness dirty action={action} onDiscard={onDiscard} />);
	await userEvent.click(screen.getByRole("button", { name: "Go" }));
	expect(screen.getByText("Discard your changes?")).toBeTruthy();
	expect(action).not.toHaveBeenCalled();
	await userEvent.click(screen.getByRole("button", { name: "Keep editing" }));
	expect(action).not.toHaveBeenCalled();
	expect(onDiscard).not.toHaveBeenCalled();
	expect(screen.queryByText("Discard your changes?")).toBeNull();
});

it("runs the action once the discard is confirmed", async () => {
	const action = vi.fn();
	const onDiscard = vi.fn();
	render(<Harness dirty action={action} onDiscard={onDiscard} />);
	await userEvent.click(screen.getByRole("button", { name: "Go" }));
	await userEvent.click(
		screen.getByRole("button", { name: "Discard changes" }),
	);
	expect(onDiscard).toHaveBeenCalledTimes(1);
	expect(action).toHaveBeenCalledTimes(1);
	expect(screen.queryByText("Discard your changes?")).toBeNull();
});

it("shows the title and asks to close through onRequestClose", async () => {
	const onRequestClose = vi.fn();
	render(
		<ManagerDialog
			open
			onRequestClose={onRequestClose}
			className="x-manager"
			title="Thing manager"
			description="About the thing."
			descriptionId="x-about"
		>
			<p>Body</p>
		</ManagerDialog>,
	);
	const dialog = screen.getByRole("dialog", { name: "Thing manager" });
	expect(dialog.className).toContain("x-manager");
	// Radix adds its own id after ours; ours must still be there.
	expect(dialog.getAttribute("aria-describedby")).toContain("x-about");
	expect(screen.getByText("About the thing.").id).toBe("x-about");
	expect(screen.getByText("Body")).toBeTruthy();
	await userEvent.keyboard("{Escape}");
	expect(onRequestClose).toHaveBeenCalledTimes(1);
});

it("has a Settings-style title bar whose close button asks via onRequestClose", async () => {
	const onRequestClose = vi.fn();
	render(
		<ManagerDialog
			open
			onRequestClose={onRequestClose}
			className="x-manager"
			title="Thing manager"
			description="About the thing."
			descriptionId="x-about"
		>
			<p>Body</p>
		</ManagerDialog>,
	);
	const bar = screen.getByText("Thing manager").closest("header");
	expect(bar?.className).toContain("settings-titlebar");
	const close = screen.getByRole("button", { name: "Close" });
	expect(bar?.contains(close)).toBe(true);
	await userEvent.click(close);
	expect(onRequestClose).toHaveBeenCalledTimes(1);
});

it("reads the text out of an error, a string or anything else", () => {
	expect(messageOf(new Error("boom"))).toBe("boom");
	expect(messageOf("plain")).toBe("plain");
	expect(messageOf(42)).toBe("42");
	expect(messageOf(null)).toBe("null");
});
