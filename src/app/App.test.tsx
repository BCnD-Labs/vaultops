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
	await user.click(screen.getByRole("button", { name: /^Class/ }));
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
	).toEqual(["Untitled", "Root", "Nested", "Lecture"]);
	expect(localStorage.getItem("vaultops:note-sort")).toBe("name-desc");

	await user.click(screen.getByRole("button", { name: "Side by side" }));
	expect(screen.getByRole("button", { name: "Stacked" })).toBeTruthy();
	expect(
		JSON.parse(localStorage.getItem("vaultops:sidebar") ?? "null").orientation,
	).toBe("horizontal");
});
