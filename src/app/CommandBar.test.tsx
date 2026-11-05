// @vitest-environment happy-dom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { COMMAND_ACTIONS, CommandBar, commandShortcut } from "./CommandBar";
import type { NoteRow } from "./session";

const notes: NoteRow[] = [
	{
		title: "Project",
		path: "Class/Project.vnote",
		preview: "",
		readOnly: false,
		tags: [],
	},
	{
		title: "A project",
		path: "A project.vnote",
		preview: "",
		readOnly: false,
		tags: [],
	},
];

const props = () => ({
	notes,
	writable: true,
	selectedFolder: "Class",
	openRequest: 0,
	onOpenNote: vi.fn(),
	onCreateNote: vi.fn(),
	onNewFolder: vi.fn(),
	onToggle: vi.fn(),
	onNavigate: vi.fn(),
});

afterEach(() => cleanup());

/** Render the bar; `open()` asks it to open, as the sidebar button and rail Search do. */
function renderBar(p = props()) {
	let request = 0;
	const view = render(<CommandBar {...p} />);
	const open = () =>
		view.rerender(<CommandBar {...p} openRequest={++request} />);
	return { p, open };
}

it("recognizes Cmd K on Mac and Ctrl K elsewhere without modifiers", () => {
	const event = {
		key: "k",
		metaKey: true,
		ctrlKey: false,
		altKey: false,
		shiftKey: false,
		isComposing: false,
		repeat: false,
	};
	expect(commandShortcut(event, true)).toBe(true);
	expect(commandShortcut(event, false)).toBe(false);
	expect(
		commandShortcut({ ...event, metaKey: false, ctrlKey: true }, false),
	).toBe(true);
	expect(commandShortcut({ ...event, shiftKey: true }, true)).toBe(false);
	expect(commandShortcut({ ...event, isComposing: true }, true)).toBe(false);
	expect(commandShortcut({ ...event, repeat: true }, true)).toBe(false);
});

it("has no floating pill and offers all working actions in the palette", async () => {
	const user = userEvent.setup();
	const { p, open } = renderBar();
	expect(
		screen.queryByRole("button", { name: "Find or create a note" }),
	).toBeNull();
	open();
	const dialog = screen.getByRole("dialog", { name: "Find or create a note" });
	expect(
		within(dialog).getByRole("combobox", { name: "Find or create a note" }),
	).toBeTruthy();
	for (const action of COMMAND_ACTIONS)
		expect(within(dialog).getByText(action)).toBeTruthy();
	await user.click(within(dialog).getByText("Toggle left sidebar"));
	expect(p.onToggle).toHaveBeenCalledWith("left");
	expect(screen.queryByRole("dialog")).toBeNull();
	open();
	await user.click(screen.getByText("New folder"));
	expect(p.onNewFolder).toHaveBeenCalledOnce();
	for (const [label, callback, value] of [
		["Toggle right sidebar", p.onToggle, "right"],
		["Open Trash", p.onNavigate, "trash"],
		["Open Vault health", p.onNavigate, "health"],
	] as const) {
		open();
		await user.click(screen.getByText(label));
		expect(callback).toHaveBeenCalledWith(value);
	}
});

it("opens a title match and creates a named note in the selected folder only when unmatched", async () => {
	const user = userEvent.setup();
	const { p, open } = renderBar();
	open();
	const input = screen.getByRole("combobox", { name: "Find or create a note" });
	await user.type(input, "PROJECT");
	const items = screen.getAllByRole("option");
	expect(items.slice(0, 2).map((item) => item.textContent?.trim())).toEqual([
		"Project",
		"A project",
	]);
	expect(screen.queryByText(/Create note:/)).toBeNull();
	await user.keyboard("{Enter}");
	expect(p.onOpenNote).toHaveBeenCalledWith("Class/Project.vnote");
	open();
	await user.type(
		screen.getByRole("combobox", { name: "Find or create a note" }),
		"Fresh idea",
	);
	expect(screen.getAllByRole("option")[0]?.textContent).toContain(
		"Create note: Fresh idea",
	);
	await user.keyboard("{Enter}");
	expect(p.onCreateNote).toHaveBeenCalledWith("Class", "Fresh idea");
});

it("opens on Ctrl K and returns focus after Escape", async () => {
	const user = userEvent.setup();
	render(
		<>
			<input aria-label="Before" />
			<CommandBar {...props()} />
		</>,
	);
	const before = screen.getByRole("textbox", { name: "Before" });
	before.focus();
	await user.keyboard("{Control>}k{/Control}");
	expect(screen.getByRole("dialog")).toBeTruthy();
	await user.keyboard("{Escape}");
	expect(screen.queryByRole("dialog")).toBeNull();
	expect(document.activeElement).toBe(before);
});
