// @vitest-environment happy-dom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { createNote } from "../core/notes/repository";
import { listTrash } from "../core/notes/trash";
import { MemoryHost } from "../host/memory-host";
import { App } from "./App";
import { loadVault } from "./session";

// Exercise App's callback wiring without depending on Tiptap's browser layout.
vi.mock("../editor/NoteEditor", () => ({
	NoteEditor: () => <div className="note-editor" />,
}));

afterEach(() => {
	cleanup();
	localStorage.clear();
});

it("saves title edits before sidebar navigation and keeps trash confirmation in the pane", async () => {
	const host = new MemoryHost();
	await loadVault(host);
	await createNote(host, "", "Original");
	const user = userEvent.setup();
	const { container } = render(<App host={host} />);
	const title = (await screen.findByRole("textbox", {
		name: "Title",
	})) as HTMLInputElement;
	expect(container.querySelector(".app .sidebar h1")?.textContent).toBe(
		"Memory vault",
	);
	expect(container.querySelector(".app .pane > .title-field")).toBe(title);
	fireEvent.change(title, { target: { value: "Renamed" } });
	await user.click(screen.getByRole("button", { name: /^Trash$/ }));
	await screen.findByText("The trash is empty.");
	expect(await host.kindOf("Renamed.vnote")).toBe("file");
	expect(screen.queryByRole("textbox", { name: "Title" })).toBeNull();
	await user.click(screen.getByRole("button", { name: "Back to notes" }));
	expect(
		(
			(await screen.findByRole("textbox", {
				name: "Title",
			})) as HTMLInputElement
		).value,
	).toBe("Renamed");
	await user.click(screen.getByRole("button", { name: "Move to trash" }));
	expect(await listTrash(host)).toEqual([]);
	await user.click(screen.getByRole("button", { name: /^Cancel$/ }));
	expect(screen.queryByText("Move this note to the trash?")).toBeNull();
	await user.click(screen.getByRole("button", { name: "Move to trash" }));
	await user.click(screen.getByRole("button", { name: "Move to trash" }));
	await screen.findByText("Pick a note, or start a new one.");
	expect(await listTrash(host)).toHaveLength(1);
});

it("keeps a partly unreadable note locked until editing is confirmed", async () => {
	const host = new MemoryHost();
	await loadVault(host);
	const note = await createNote(host, "", "Damaged");
	await host.writeTextAtomic(
		note.path,
		`${await host.readText(note.path)}bad\n`,
	);
	const user = userEvent.setup();
	render(<App host={host} />);
	const title = (await screen.findByRole("textbox", {
		name: "Title",
	})) as HTMLInputElement;
	expect(title.readOnly).toBe(true);
	await user.click(screen.getByRole("button", { name: "Allow editing" }));
	expect(title.readOnly).toBe(true);
	await user.click(screen.getByRole("button", { name: "Keep read-only" }));
	expect(title.readOnly).toBe(true);
	await user.click(screen.getByRole("button", { name: "Allow editing" }));
	await user.click(screen.getByRole("button", { name: "Allow editing" }));
	await waitFor(() => expect(title.readOnly).toBe(false));
	expect(await host.readText(note.path)).toContain("bad\n");
});
