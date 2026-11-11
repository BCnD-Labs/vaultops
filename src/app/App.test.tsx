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
import { listTrash, trashFolder } from "../core/notes/trash";
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
	await user.click(screen.getByRole("button", { name: "New canvas" }));
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
	expect(within(canvas).queryByRole("combobox")).toBeNull();
	// The sidebar row and the canvas's tab both carry the new path.
	expect(screen.getAllByTitle("Sprint board.vnote")).toHaveLength(2);
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

it("opens a canvas as its own tab, putting the note away, and closing it brings the note back", async () => {
	const host = new MemoryHost();
	await loadVault(host);
	await createNote(host, "", "Essay");
	await createCanvas(host, "", "Board");
	const user = userEvent.setup();
	render(<App host={host} />);
	await screen.findByRole("textbox", { name: "Title" });
	await user.click(screen.getByTitle("Board.vnote"));
	await screen.findByRole("region", { name: "Canvas view" });
	// The canvas fills the editor: no note beside it, and it has a tab.
	expect(screen.queryByRole("textbox", { name: "Title" })).toBeNull();
	const tabs = within(screen.getByRole("tablist", { name: "Open notes" }));
	expect(
		tabs.getAllByRole("tab").map((tab) => tab.getAttribute("aria-selected")),
	).toEqual(["false", "true"]);
	await user.click(screen.getByRole("button", { name: "Close Board" }));
	expect(screen.queryByRole("region", { name: "Canvas view" })).toBeNull();
	const title = (await screen.findByRole("textbox", {
		name: "Title",
	})) as HTMLInputElement;
	expect(title.readOnly).toBe(false);
	expect(tabs.getAllByRole("tab")).toHaveLength(1);
	expect(localStorage.getItem("vaultops:last-canvas")).toContain("Board.vnote");
});

it("saves title edits before sidebar navigation, and the note menu trashes at once with Undo", async () => {
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
	await user.click(screen.getByRole("button", { name: /^Vault menu:/ }));
	await user.click(await screen.findByRole("menuitem", { name: "Trash" }));
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
	// No question first: nothing is erased, and the notice offers Undo.
	await screen.findByText("Pick a note, or start a new one.");
	expect(await listTrash(host)).toHaveLength(1);
	expect(screen.getByText('Moved "Renamed" to the trash.')).toBeTruthy();
	await user.click(screen.getByRole("button", { name: "Undo" }));
	await waitFor(async () => expect(await listTrash(host)).toEqual([]));
	expect(await host.kindOf("Renamed.vnote")).toBe("file");
	expect(
		(
			(await screen.findByRole("textbox", {
				name: "Title",
			})) as HTMLInputElement
		).value,
	).toBe("Renamed");
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

it("opens an empty tab with +, and closing either tab hands the editor to the other", async () => {
	const host = new MemoryHost();
	await loadVault(host);
	await createNote(host, "", "Alpha");
	const user = userEvent.setup();
	render(<App host={host} />);
	await screen.findByRole("textbox", { name: "Title" });
	await user.click(screen.getByRole("button", { name: "New tab" }));
	// The empty tab shows the three ways to start, and the note is put away.
	expect(
		await screen.findByText("Pick a note, or start a new one."),
	).toBeTruthy();
	expect(screen.getByRole("button", { name: "Create a note" })).toBeTruthy();
	expect(screen.getByRole("button", { name: "Create a canvas" })).toBeTruthy();
	expect(
		screen.getByRole("button", { name: /Open a note or canvas/ }),
	).toBeTruthy();
	expect(screen.queryByRole("textbox", { name: "Title" })).toBeNull();
	const tabs = within(
		screen.getByRole("tablist", { name: "Open notes" }),
	).getAllByRole("tab");
	expect(tabs.map((tab) => tab.textContent)).toEqual(["Alpha", "New tab"]);
	expect(tabs.map((tab) => tab.getAttribute("aria-selected"))).toEqual([
		"false",
		"true",
	]);
	// Closing the empty tab brings the note back.
	await user.click(screen.getByRole("button", { name: "Close New tab" }));
	expect(await screen.findByRole("textbox", { name: "Title" })).toBeTruthy();
	expect(
		within(screen.getByRole("tablist", { name: "Open notes" }))
			.getAllByRole("tab")
			.map((tab) => tab.textContent),
	).toEqual(["Alpha"]);
	// With the note's tab closed instead, the empty tab fills the editor.
	await user.click(screen.getByRole("button", { name: "New tab" }));
	await screen.findByText("Pick a note, or start a new one.");
	await user.click(screen.getByRole("tab", { name: "Alpha" }));
	await screen.findByRole("textbox", { name: "Title" });
	await user.click(screen.getByRole("button", { name: "Close Alpha" }));
	await screen.findByText("Pick a note, or start a new one.");
	expect(screen.queryByRole("textbox", { name: "Title" })).toBeNull();
	expect(
		within(screen.getByRole("tablist", { name: "Open notes" }))
			.getAllByRole("tab")
			.map((tab) => tab.textContent),
	).toEqual(["New tab"]);
});

it("replaces the empty tab with whatever is created or opened from it", async () => {
	const host = new MemoryHost();
	await loadVault(host);
	await createNote(host, "", "Alpha");
	const user = userEvent.setup();
	render(<App host={host} />);
	await screen.findByRole("textbox", { name: "Title" });
	await user.click(screen.getByRole("button", { name: "New tab" }));
	await user.click(
		await screen.findByRole("button", { name: "Create a note" }),
	);
	await screen.findByRole("textbox", { name: "Title" });
	expect(
		within(screen.getByRole("tablist", { name: "Open notes" }))
			.getAllByRole("tab")
			.map((tab) => tab.textContent),
	).toEqual(["Alpha", "Untitled"]);
	// A canvas made from the empty tab does not leave the empty tab behind either.
	await user.click(screen.getByRole("button", { name: "New tab" }));
	await user.click(
		await screen.findByRole("button", { name: "Create a canvas" }),
	);
	await screen.findByRole("region", { name: "Canvas view" });
	expect(screen.queryByRole("tab", { name: "New tab" })).toBeNull();
	// Opening an existing note from the sidebar replaces it as well.
	await user.click(screen.getByRole("button", { name: "New tab" }));
	await screen.findByText("Pick a note, or start a new one.");
	await user.click(screen.getByRole("button", { name: /^Alpha/ }));
	await screen.findByRole("textbox", { name: "Title" });
	expect(screen.queryByRole("tab", { name: "New tab" })).toBeNull();
});

it("moves a note to the trash from its sidebar row at once, and Undo brings it back", async () => {
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
	await user.click(await screen.findByRole("button", { name: "Undo" }));
	await waitFor(async () =>
		expect(await host.kindOf("Drop me.vnote")).toBe("file"),
	);
	expect(await listTrash(host)).toEqual([]);
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
	fireEvent.contextMenu(within(tree).getByRole("button", { name: /^Board/ }));
	await user.click(
		await screen.findByRole("menuitem", { name: "Move to trash" }),
	);
	await waitFor(async () => expect(await listTrash(host)).toHaveLength(1));
	await waitFor(() =>
		expect(screen.queryByRole("region", { name: "Canvas view" })).toBeNull(),
	);
	expect(await host.kindOf("Board.vnote")).toBeNull();
});

it("splits the view from a note tab, fills the right pane with a canvas, and closes the split", async () => {
	const host = new MemoryHost();
	await loadVault(host);
	await createNote(host, "", "Essay");
	const user = userEvent.setup();
	render(<App host={host} />);
	await screen.findByRole("textbox", { name: "Title" });
	const strip = () =>
		within(screen.getByRole("tablist", { name: "Open notes" }));
	fireEvent.contextMenu(
		strip().getByRole("tab", { name: "Essay" }).parentElement as HTMLElement,
	);
	await user.click(await screen.findByRole("menuitem", { name: "Split view" }));
	// The note stays; the right pane is empty and can start a note or a canvas.
	expect(screen.getByRole("textbox", { name: "Title" })).toBeTruthy();
	expect(screen.queryByRole("region", { name: "Canvas view" })).toBeNull();
	expect(screen.getByRole("button", { name: "Create a note" })).toBeTruthy();
	await user.click(
		await screen.findByRole("button", { name: "Create a canvas" }),
	);
	await screen.findByRole("region", { name: "Canvas view" });
	expect(screen.getByRole("textbox", { name: "Title" })).toBeTruthy();
	// Each side has its own tab strip: the note on the left, the canvas on the right.
	const right = () =>
		within(screen.getByRole("tablist", { name: "Open notes, right side" }));
	expect(
		strip()
			.getAllByRole("tab")
			.map((tab) => tab.textContent),
	).toEqual(["Essay"]);
	expect(
		right()
			.getAllByRole("tab")
			.map((tab) => tab.textContent),
	).toEqual(["Untitled canvas"]);
	// "Close split view" brings the canvas's tab back to the one strip; it just stops showing.
	fireEvent.contextMenu(
		right().getAllByRole("tab")[0]?.parentElement as HTMLElement,
	);
	await user.click(
		await screen.findByRole("menuitem", { name: "Close split view" }),
	);
	expect(screen.queryByRole("region", { name: "Canvas view" })).toBeNull();
	expect(
		screen.queryByRole("tablist", { name: "Open notes, right side" }),
	).toBeNull();
	expect(screen.getByRole("textbox", { name: "Title" })).toBeTruthy();
	expect(strip().getAllByRole("tab")).toHaveLength(2);
});

it("ends the split when the canvas in it is closed, and a canvas tab splits beside the note", async () => {
	const host = new MemoryHost();
	await loadVault(host);
	await createNote(host, "", "Essay");
	await createCanvas(host, "", "Board");
	const user = userEvent.setup();
	render(<App host={host} />);
	await screen.findByRole("textbox", { name: "Title" });
	await user.click(screen.getByTitle("Board.vnote"));
	await screen.findByRole("region", { name: "Canvas view" });
	const board = within(
		screen.getByRole("tablist", { name: "Open notes" }),
	).getByRole("tab", { name: "Board" });
	fireEvent.contextMenu(board.parentElement as HTMLElement);
	await user.click(await screen.findByRole("menuitem", { name: "Split view" }));
	await screen.findByRole("textbox", { name: "Title" });
	await screen.findByRole("region", { name: "Canvas view" });
	await user.click(screen.getByRole("button", { name: "Close Board" }));
	expect(screen.queryByRole("region", { name: "Canvas view" })).toBeNull();
	expect(screen.getByRole("textbox", { name: "Title" })).toBeTruthy();
});

it("Restore in the trash offers to open the note, and says when its folder is gone", async () => {
	const host = new MemoryHost();
	await loadVault(host);
	await host.makeFolder("Class");
	const made = await createNote(host, "Class", "Lecture");
	const user = userEvent.setup();
	const { container } = render(<App host={host} />);
	await screen.findByRole("textbox", { name: "Title" });
	const tree = container.querySelector(".sidebar") as HTMLElement;
	await user.click(
		await within(tree).findByRole("button", {
			name: "Move note Lecture to the trash",
		}),
	);
	await waitFor(async () => expect(await listTrash(host)).toHaveLength(1));
	// The folder goes away while the note is in the trash.
	await trashFolder(host, "Class");
	await user.click(screen.getByRole("button", { name: /^Vault menu:/ }));
	await user.click(await screen.findByRole("menuitem", { name: "Trash" }));
	await user.click(await screen.findByRole("button", { name: /Restore/ }));
	expect(
		await screen.findByText(
			/Its folder "Class" is gone, so it is in the vault root\./,
		),
	).toBeTruthy();
	await user.click(screen.getByRole("button", { name: "Open" }));
	expect(
		(
			(await screen.findByRole("textbox", {
				name: "Title",
			})) as HTMLInputElement
		).value,
	).toBe("Lecture");
	expect(await host.kindOf("Lecture.vnote")).toBe("file");
	expect(await host.kindOf(made.path)).toBeNull();
});
