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
import { createCanvas, createNote } from "../core/notes/repository";
import { listTrash } from "../core/notes/trash";
import { MemoryHost } from "../host/memory-host";
import { App } from "./App";
import { loadVault } from "./session";

// Exercise App's callback wiring without depending on Tiptap's browser layout.
vi.mock("../editor/NoteEditor", () => ({
	NoteEditor: () => <div className="note-editor" />,
}));

// These tests drive the notebook-navigator layout (folders plus a notes list).
beforeEach(() => {
	localStorage.setItem("vaultops:sidebar-mode", "navigator");
});

afterEach(() => {
	cleanup();
	localStorage.clear();
});

it("opens a canvas beside the editor, creates and renames a canvas, and remembers it across restarts", async () => {
	const host = new MemoryHost();
	await loadVault(host);
	await createCanvas(host, "", "Board");
	const user = userEvent.setup();
	const { container, unmount } = render(<App host={host} />);
	const canvas = await screen.findByRole("region", { name: "Canvas view" });
	expect(container.querySelector(".note-editor")).toBeNull();
	expect(screen.queryByRole("textbox", { name: "Title" })).toBeNull();
	expect(
		within(canvas).getByText("Drag a block here from a note."),
	).toBeTruthy();
	await user.click(within(canvas).getByRole("button", { name: "New canvas" }));
	await waitFor(() =>
		expect(host.kindOf("Untitled canvas.vnote")).resolves.toBe("file"),
	);
	expect(await host.readText("Untitled canvas.vnote")).toContain(
		'"kind":"canvas"',
	);
	const nameInput = within(canvas).getByRole("textbox", {
		name: "Canvas name",
	}) as HTMLInputElement;
	await waitFor(() => {
		expect(nameInput.disabled).toBe(false);
		expect(nameInput.value).toBe("Untitled canvas");
		expect(document.activeElement).toBe(nameInput);
		expect(nameInput.selectionStart).toBe(0);
		expect(nameInput.selectionEnd).toBe("Untitled canvas".length);
	});
	fireEvent.change(nameInput, { target: { value: "Sprint board" } });
	fireEvent.keyDown(nameInput, { key: "Enter" });
	await waitFor(() =>
		expect(host.kindOf("Sprint board.vnote")).resolves.toBe("file"),
	);
	expect(await host.kindOf("Untitled canvas.vnote")).toBeNull();
	expect(
		(
			within(canvas).getByRole("combobox", {
				name: "Canvas",
			}) as HTMLSelectElement
		).value,
	).toBe("Sprint board.vnote");
	expect(screen.getByTitle("Sprint board.vnote")).toBeTruthy();
	expect(localStorage.getItem("vaultops:last-canvas")).toContain(
		"Sprint board.vnote",
	);

	unmount();
	render(<App host={host} />);
	const reopened = await screen.findByRole("region", { name: "Canvas view" });
	await waitFor(() =>
		expect(
			(
				within(reopened).getByRole("textbox", {
					name: "Canvas name",
				}) as HTMLInputElement
			).value,
		).toBe("Sprint board"),
	);
});

it("keeps the note editable when a canvas opens and remembers the last canvas", async () => {
	const host = new MemoryHost();
	await loadVault(host);
	await createNote(host, "", "Essay");
	await createCanvas(host, "", "Board");
	const user = userEvent.setup();
	render(<App host={host} />);
	const title = (await screen.findByRole("textbox", {
		name: "Title",
	})) as HTMLInputElement;
	await user.click(screen.getByTitle("Board.vnote"));
	await screen.findByRole("region", { name: "Canvas view" });
	expect(title.readOnly).toBe(false);
	await user.click(screen.getByRole("button", { name: "Close canvas" }));
	expect(screen.queryByRole("region", { name: "Canvas view" })).toBeNull();
	expect(localStorage.getItem("vaultops:last-canvas")).toContain("Board.vnote");
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
	expect(
		container.querySelector(".app .sidebar .vault-switch")?.textContent,
	).toBe("Memory vault");
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
	await user.click(screen.getByRole("button", { name: "Note actions" }));
	await user.click(screen.getByRole("menuitem", { name: "Move to trash" }));
	expect(await listTrash(host)).toEqual([]);
	await user.click(screen.getByRole("button", { name: /^Cancel$/ }));
	expect(screen.queryByText("Move this note to the trash?")).toBeNull();
	await user.click(screen.getByRole("button", { name: "Note actions" }));
	await user.click(screen.getByRole("menuitem", { name: "Move to trash" }));
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

it("filters direct folder children, creates there, and preserves All notes when opening a list row", async () => {
	const host = new MemoryHost();
	await loadVault(host);
	await host.makeFolder("Class/Week");
	await createNote(host, "", "Root");
	await createNote(host, "Class", "Lecture");
	await createNote(host, "Class/Week", "Nested");
	const user = userEvent.setup();
	const { container } = render(<App host={host} />);
	await screen.findByRole("textbox", { name: "Title" });
	await user.click(
		within(screen.getByRole("region", { name: "Navigation" })).getByRole(
			"button",
			{ name: /^Class/ },
		),
	);
	const list = () =>
		container.querySelector('[aria-label="Notes list"]') as HTMLElement;
	const search = screen.getByRole("textbox", { name: "Search notes" });
	await user.type(search, "no match");
	expect(list().textContent).toContain("No notes match.");
	await user.keyboard("{Escape}");
	expect((search as HTMLInputElement).value).toBe("");
	expect(list().textContent).toContain("Lecture");
	expect(list().textContent).not.toContain("Nested");
	expect(list().textContent).not.toContain("Root");
	await user.click(screen.getByRole("button", { name: "New note" }));
	await waitFor(() =>
		expect(
			(screen.getByRole("textbox", { name: "Title" }) as HTMLInputElement)
				.value,
		).toBe("Untitled"),
	);
	expect(await host.kindOf("Class/Untitled.vnote")).toBe("file");
	await user.click(screen.getByRole("button", { name: /^All notes/ }));
	await user.click(screen.getByRole("button", { name: "Root" }));
	await waitFor(() =>
		expect(
			(screen.getByRole("textbox", { name: "Title" }) as HTMLInputElement)
				.value,
		).toBe("Root"),
	);
	expect(list().textContent).toContain("Nested");
	expect(list().textContent).toContain("All notes");
	await user.click(screen.getByRole("button", { name: "Sort notes" }));
	await user.click(
		screen.getByRole("menuitemradio", { name: "Name (Z to A)" }),
	);
	expect(
		[...list().querySelectorAll(".note-row-title")].map((n) => n.textContent),
	).toEqual(["Root", "Untitled", "Lecture", "Nested"]);
	expect(localStorage.getItem("vaultops:note-sort")).toBe("name-desc");

	await user.click(screen.getByRole("button", { name: "Side by side" }));
	expect(screen.getByRole("button", { name: "Stacked" })).toBeTruthy();
	expect(
		JSON.parse(localStorage.getItem("vaultops:sidebar") ?? "null").orientation,
	).toBe("horizontal");
});

it("creates a named note from the command bar and starts the existing folder flow", async () => {
	const host = new MemoryHost();
	await loadVault(host);
	await host.makeFolder("Class");
	const user = userEvent.setup();
	render(<App host={host} />);
	await screen.findByRole("button", { name: "New note" });
	await user.click(screen.getByRole("button", { name: /^Class/ }));
	await user.click(
		screen.getByRole("button", { name: "Find or create a note" }),
	);
	await user.type(
		screen.getByRole("combobox", { name: "Find or create a note" }),
		"New idea",
	);
	await user.keyboard("{Enter}");
	await waitFor(() =>
		expect(host.kindOf("Class/New idea.vnote")).resolves.toBe("file"),
	);
	expect(
		(
			(await screen.findByRole("textbox", {
				name: "Title",
			})) as HTMLInputElement
		).value,
	).toBe("New idea");
	await user.click(
		screen.getByRole("button", { name: "Find or create a note" }),
	);
	await user.click(screen.getByText("New folder"));
	expect(await screen.findByRole("textbox", { name: "New folder name" })).toBe(
		document.activeElement,
	);
});

it("opens Find or create a note from a button in the left sidebar, with no floating pill, and returns focus to it", async () => {
	const host = new MemoryHost();
	await loadVault(host);
	const user = userEvent.setup();
	render(<App host={host} />);
	const button = await screen.findByRole("button", {
		name: "Find or create a note",
	});
	expect(button.closest(".sidebar")).not.toBeNull();
	expect(document.querySelector(".command-pill")).toBeNull();
	expect(
		screen.getAllByRole("button", { name: "Find or create a note" }),
	).toHaveLength(1);
	await user.click(button);
	expect(
		screen.getByRole("dialog", { name: "Find or create a note" }),
	).toBeTruthy();
	await user.keyboard("{Escape}");
	expect(screen.queryByRole("dialog")).toBeNull();
	expect(document.activeElement).toBe(button);
});

it("moves a note to the trash from its sidebar row, after a confirm step", async () => {
	const host = new MemoryHost();
	await loadVault(host);
	await createNote(host, "", "Keep me");
	await createNote(host, "", "Drop me");
	const user = userEvent.setup();
	const { container } = render(<App host={host} />);
	await screen.findByRole("button", { name: "Move note Drop me to the trash" });
	const tree = container.querySelector(".sidebar") as HTMLElement;
	await user.click(
		within(tree).getByRole("button", {
			name: "Move note Drop me to the trash",
		}),
	);
	// Asked first; cancelling changes nothing.
	expect(within(tree).getByText(/to the trash\? You can restore/)).toBeTruthy();
	await user.click(within(tree).getByRole("button", { name: "Cancel" }));
	expect(await listTrash(host)).toEqual([]);
	await user.click(
		within(tree).getByRole("button", {
			name: "Move note Drop me to the trash",
		}),
	);
	await user.click(within(tree).getByRole("button", { name: "Move to trash" }));
	await waitFor(async () => expect(await listTrash(host)).toHaveLength(1));
	await waitFor(() =>
		expect(
			within(tree).queryByRole("button", {
				name: "Move note Drop me to the trash",
			}),
		).toBeNull(),
	);
	expect(await host.kindOf("Keep me.vnote")).toBe("file");
	expect(await host.kindOf("Drop me.vnote")).toBeNull();
});

it("moves a canvas to the trash from its sidebar row and closes it", async () => {
	const host = new MemoryHost();
	await loadVault(host);
	await createCanvas(host, "", "Board");
	const user = userEvent.setup();
	const { container } = render(<App host={host} />);
	await screen.findByRole("region", { name: "Canvas view" });
	const tree = container.querySelector(".sidebar") as HTMLElement;
	// The folder tree view has its own rows, so check it as well as the list.
	await user.click(
		within(tree).getByRole("button", { name: "Folder tree view" }),
	);
	await user.click(
		within(tree).getByRole("button", {
			name: "Move canvas Board to the trash",
		}),
	);
	await user.click(within(tree).getByRole("button", { name: "Move to trash" }));
	await waitFor(async () => expect(await listTrash(host)).toHaveLength(1));
	await waitFor(() =>
		expect(screen.queryByRole("region", { name: "Canvas view" })).toBeNull(),
	);
	expect(await host.kindOf("Board.vnote")).toBeNull();
});
