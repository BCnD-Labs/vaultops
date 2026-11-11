// @vitest-environment happy-dom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createNote } from "../core/notes/repository";
import { MemoryHost } from "../host/memory-host";
import { App } from "./App";
import { loadVault } from "./session";

vi.mock("../editor/NoteEditor", () => ({
	NoteEditor: () => <div data-testid="editor" />,
}));

beforeEach(() => {
	localStorage.setItem("vaultops:sidebar-mode", "navigator");
});

afterEach(() => {
	cleanup();
	localStorage.clear();
});

async function setup() {
	const host = new MemoryHost();
	await loadVault(host);
	await host.makeFolder("Class");
	const note = await createNote(host, "", "Essay");
	render(<App host={host} />);
	await screen.findByRole("textbox", { name: "Title" });
	return { host, note };
}

async function chooseFolder(
	user: ReturnType<typeof userEvent.setup>,
	name: string,
) {
	fireEvent.pointerDown(screen.getByRole("button", { name: "Note actions" }), {
		button: 0,
		ctrlKey: false,
	});
	await user.click(await screen.findByRole("menuitem", { name: "Move to…" }));
	const dialog = await screen.findByRole("dialog");
	await user.click(within(dialog).getByText(name));
}

it("moves the open note to a folder from its menu, and Undo puts it back", async () => {
	const user = userEvent.setup();
	const { host, note } = await setup();
	await chooseFolder(user, "Class");
	await waitFor(async () => {
		expect(await host.kindOf("Class/Essay.vnote")).toBe("file");
		expect(await host.kindOf(note.path)).not.toBe("file");
	});
	expect(await screen.findByText('Moved "Essay" to Class.')).toBeTruthy();
	// The open tab followed the file.
	expect(screen.getByRole("textbox", { name: "Title" })).toBeTruthy();

	await user.click(screen.getByRole("button", { name: "Undo" }));
	await waitFor(async () => {
		expect(await host.kindOf(note.path)).toBe("file");
		expect(await host.kindOf("Class/Essay.vnote")).not.toBe("file");
	});
	expect(screen.getByRole("textbox", { name: "Title" })).toBeTruthy();
});

it("the folder picker is also reachable from Ctrl+K", async () => {
	const user = userEvent.setup();
	const { host } = await setup();
	fireEvent.keyDown(window, { key: "k", ctrlKey: true });
	await user.type(
		await screen.findByRole("combobox", { name: "Find or create a note" }),
		"move",
	);
	await user.click(await screen.findByText("Move note to folder…"));
	const dialog = await screen.findByRole("dialog", { name: "Move note to" });
	await user.click(within(dialog).getByText("Class"));
	await waitFor(async () =>
		expect(await host.kindOf("Class/Essay.vnote")).toBe("file"),
	);
});
