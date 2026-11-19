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

function Manager({
	kind = "x-manager",
	dirty = false,
	focusRequest,
	onRequestClose,
}: {
	kind?: string;
	dirty?: boolean;
	focusRequest?: object;
	onRequestClose: () => void;
}) {
	const { guard, dialog } = useDiscardGuard(dirty, {
		title: "Discard your changes?",
		description: "Going on will drop them.",
		confirmLabel: "Discard changes",
		cancelLabel: "Keep editing",
	});
	return (
		<ManagerDialog
			open
			onRequestClose={() => guard(onRequestClose)}
			className="x-manager"
			kind={kind}
			focusRequest={focusRequest}
			title="Thing manager"
			description="About the thing."
		>
			<input aria-label="Card field" />
			{dialog}
		</ManagerDialog>
	);
}

it("is a non-modal window: the note stays typeable and only its own Escape closes it", async () => {
	const user = userEvent.setup();
	const onRequestClose = vi.fn();
	render(
		<>
			<textarea aria-label="Note editor" />
			<Manager onRequestClose={onRequestClose} />
		</>,
	);
	const dialog = screen.getByRole("dialog", { name: "Thing manager" });
	expect(dialog.className).toContain("x-manager");
	expect(dialog.getAttribute("aria-describedby")).toBe(
		screen.getByText("About the thing.").id,
	);
	expect(document.querySelector('[data-slot="dialog-overlay"]')).toBeNull();
	const editor = screen.getByLabelText<HTMLTextAreaElement>("Note editor");
	await user.type(editor, "hello{Escape}");
	expect(editor.value).toBe("hello");
	expect(onRequestClose).not.toHaveBeenCalled();
	await user.click(screen.getByLabelText("Card field"));
	await user.keyboard("{Escape}");
	expect(onRequestClose).toHaveBeenCalledTimes(1);
	const bar = screen.getByText("Thing manager").closest("header");
	expect(bar?.className).toContain("settings-titlebar");
	const close = screen.getByRole("button", { name: "Close" });
	expect(close.getAttribute("data-variant")).toBe("ghost");
	await user.click(close);
	expect(onRequestClose).toHaveBeenCalledTimes(2);
});

it("remembers each manager's place and size, and a focus request brings it back", async () => {
	const user = userEvent.setup();
	localStorage.setItem(
		"vaultops.window.small-manager",
		JSON.stringify({ left: 40, top: 40, width: 360, height: 300 }),
	);
	const { rerender, unmount } = render(
		<>
			<textarea aria-label="Note editor" />
			<Manager kind="small-manager" onRequestClose={vi.fn()} />
		</>,
	);
	const panel = screen.getByRole("dialog", { name: "Thing manager" });
	// A small window: the content inside is the container the narrow
	// layouts query (manager-style.test.ts checks the rules).
	expect(panel.style.width).toBe("360px");
	expect(panel.querySelector(".manager-content")).toBeTruthy();
	(panel.querySelector("header") as HTMLElement).focus();
	await user.keyboard("{ArrowRight}");
	expect(panel.style.left).toBe("48px");

	await user.click(screen.getByLabelText("Note editor"));
	rerender(
		<>
			<textarea aria-label="Note editor" />
			<Manager
				kind="small-manager"
				focusRequest={{}}
				onRequestClose={vi.fn()}
			/>
		</>,
	);
	expect(panel.contains(document.activeElement)).toBe(true);
	unmount();
	render(<Manager kind="small-manager" onRequestClose={vi.fn()} />);
	expect(screen.getByRole("dialog").style.left).toBe("48px");
	cleanup();
	render(<Manager kind="other-manager" onRequestClose={vi.fn()} />);
	expect(screen.getByRole("dialog").style.width).not.toBe("360px");
	localStorage.clear();
});

it("asks before closing over edits, and Escape in the question only cancels it", async () => {
	const user = userEvent.setup();
	const onRequestClose = vi.fn();
	render(<Manager dirty onRequestClose={onRequestClose} />);
	await user.click(screen.getByLabelText("Card field"));
	await user.keyboard("{Escape}");
	expect(await screen.findByText("Discard your changes?")).toBeTruthy();
	await user.keyboard("{Escape}");
	expect(screen.queryByText("Discard your changes?")).toBeNull();
	expect(screen.getByRole("dialog", { name: "Thing manager" })).toBeTruthy();
	expect(onRequestClose).not.toHaveBeenCalled();
	await user.click(screen.getByRole("button", { name: "Close" }));
	await user.click(screen.getByRole("button", { name: "Discard changes" }));
	expect(onRequestClose).toHaveBeenCalledTimes(1);
});

it("reads the text out of an error, a string or anything else", () => {
	expect(messageOf(new Error("boom"))).toBe("boom");
	expect(messageOf("plain")).toBe("plain");
	expect(messageOf(42)).toBe("42");
	expect(messageOf(null)).toBe("null");
});
