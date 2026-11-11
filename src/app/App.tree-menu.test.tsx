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
import { afterEach, expect, it, vi } from "vitest";
import { createNote, loadNote } from "../core/notes/repository";
import { MemoryHost } from "../host/memory-host";
import { App } from "./App";
import { loadVault } from "./session";

vi.mock("../editor/NoteEditor", () => ({
	NoteEditor: () => <div data-testid="editor" />,
}));

afterEach(() => {
	cleanup();
	localStorage.clear();
});

async function setup() {
	const host = new MemoryHost();
	await loadVault(host);
	await host.makeFolder("Class");
	await createNote(host, "", "Reading");
	const essay = await createNote(host, "", "Essay");
	render(<App host={host} />);
	const title = (await screen.findByRole("textbox", {
		name: "Title",
	})) as HTMLInputElement;
	return { host, essay, title };
}

/** Right-click a sidebar row and pick a menu item. */
async function pick(
	user: ReturnType<typeof userEvent.setup>,
	row: string,
	item: string,
) {
	const sidebar = screen.getByRole("complementary", {
		name: "Vault navigation",
	});
	fireEvent.contextMenu(
		within(sidebar).getByRole("button", { name: new RegExp(`^${row}`) }),
	);
	await user.click(await screen.findByRole("menuitem", { name: item }));
}

it("renames the open note through its own title: it saves and its tab follows", async () => {
	const user = userEvent.setup();
	const { host, title } = await setup();
	expect(title.value).toBe("Essay");
	await pick(user, "Essay", "Rename");
	const field = screen.getByLabelText("Rename note Essay");
	await user.clear(field);
	await user.type(field, "Final essay{Enter}");
	await waitFor(async () => {
		expect(await host.kindOf("Final essay.vnote")).toBe("file");
		expect(await host.kindOf("Essay.vnote")).not.toBe("file");
	});
	expect(
		(screen.getByRole("textbox", { name: "Title" }) as HTMLInputElement).value,
	).toBe("Final essay");
});

it("renames a note that is not open on disk", async () => {
	const user = userEvent.setup();
	const { host } = await setup();
	await pick(user, "Reading", "Rename");
	const field = screen.getByLabelText("Rename note Reading");
	await user.clear(field);
	await user.type(field, "Outline{Enter}");
	await waitFor(async () =>
		expect(await host.kindOf("Outline.vnote")).toBe("file"),
	);
	const note = (await loadNote(host, "Outline.vnote")).note;
	expect(note?.header.title).toBe("Outline");
});

it("duplicates the open note after saving it, so the copy has the latest title", async () => {
	const user = userEvent.setup();
	const { host, essay, title } = await setup();
	await user.clear(title);
	await user.type(title, "Essay two");
	await pick(user, "Essay", "Duplicate");
	await waitFor(async () =>
		expect(await host.kindOf("Essay two (copy).vnote")).toBe("file"),
	);
	const copy = (await loadNote(host, "Essay two (copy).vnote")).note;
	expect(copy?.header.noteId).not.toBe(essay.note.header.noteId);
});

it("moves a note to a folder picked from its menu", async () => {
	const user = userEvent.setup();
	const { host } = await setup();
	await pick(user, "Reading", "Move to…");
	const dialog = await screen.findByRole("dialog", { name: "Move to" });
	await user.click(within(dialog).getByText("Class"));
	await waitFor(async () =>
		expect(await host.kindOf("Class/Reading.vnote")).toBe("file"),
	);
});

it("trashes the open note even right after an unsaved title edit renamed it", async () => {
	const user = userEvent.setup();
	const { host, title } = await setup();
	await user.clear(title);
	await user.type(title, "Essay two");
	await pick(user, "Essay", "Move to trash");
	await waitFor(async () => {
		expect(await host.kindOf("Essay two.vnote")).not.toBe("file");
		expect(await host.kindOf("Essay.vnote")).not.toBe("file");
	});
	expect(await screen.findByText(/Moved ".*" to the trash\./)).toBeTruthy();
});
