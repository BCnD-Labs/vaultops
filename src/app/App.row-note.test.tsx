// @vitest-environment happy-dom
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createNote, loadNote } from "../core/notes/repository";
import type { LinkSource } from "../editor/note-link";
import { MemoryHost } from "../host/memory-host";
import { App } from "./App";
import { loadVault } from "./session";

// The editor is replaced by a stand-in that keeps what the app gave it, so
// the test can do what a row's panel does: ask the app to make a note.
let links: LinkSource | undefined;
vi.mock("../editor/NoteEditor", () => ({
	NoteEditor: (props: { links?: LinkSource }) => {
		links = props.links;
		return <div className="note-editor" />;
	},
}));

beforeEach(() => {
	links = undefined;
	localStorage.setItem("vaultops:sidebar-mode", "navigator");
});

afterEach(() => {
	cleanup();
	localStorage.clear();
});

type Created = Awaited<
	ReturnType<NonNullable<LinkSource["rowNotes"]>["create"]>
>;

const page = [
	{
		type: "paragraph",
		attrs: { id: "p1" },
		content: [{ type: "text", text: "Spice" }],
	},
];

it("makes a row's note beside the database's note, and the new note shows in the list", async () => {
	const host = new MemoryHost();
	await loadVault(host);
	await host.makeFolder("Books");
	const shelf = await createNote(host, "Books", "Shelf");
	render(<App host={host} />);
	await waitFor(() => expect(links?.rowNotes).toBeTruthy());

	let made = { ok: false, message: "not run" } as Created;
	await act(async () => {
		made = (await links?.rowNotes?.create({
			from: shelf.note.header.noteId,
			title: "Dune",
			content: page,
		})) ?? { ok: false, message: "no source" };
	});
	if (!made.ok) throw new Error(made.message);

	const parsed = await loadNote(host, "Books/Dune.vnote");
	expect(parsed.note?.header.noteId).toBe(made.target);
	expect(parsed.note?.header.title).toBe("Dune");
	expect(JSON.stringify(parsed.note?.blocks)).toContain("Spice");
	await waitFor(() =>
		expect(screen.getByTitle("Books/Dune.vnote")).toBeTruthy(),
	);
	// The database's own note is untouched.
	expect((await loadNote(host, "Books/Shelf.vnote")).note?.blocks).toHaveLength(
		1,
	);
	// The app now knows the note, so a row can name it and open it.
	await waitFor(() =>
		expect(links?.describe("note", made.ok ? made.target : "")).toBe("Dune"),
	);
});

it("reports why when the note can't be made, and writes nothing", async () => {
	const host = new MemoryHost();
	await loadVault(host);
	const shelf = await createNote(host, "", "Shelf");
	render(<App host={host} />);
	await waitFor(() => expect(links?.rowNotes).toBeTruthy());
	host.writeTextAtomic = async () => {
		throw new Error("disk full");
	};
	let made = { ok: true, target: "x" } as Created;
	await act(async () => {
		made = (await links?.rowNotes?.create({
			from: shelf.note.header.noteId,
			title: "Dune",
			content: page,
		})) ?? { ok: true, target: "no source" };
	});
	expect(made).toEqual({
		ok: false,
		message: "The note was not made: disk full",
	});
	expect(await host.kindOf("Dune.vnote")).toBeNull();
});

const shelfBlocks = (noteId: string, title = "Dune") => [
	{ id: "db", type: "database", parent: null },
	{
		id: "r1",
		type: "databaseRow",
		parent: "db",
		attrs: { cells: { title }, noteId },
	},
];
const rowName = async (host: MemoryHost, path: string) =>
	(
		(await loadNote(host, path)).note?.blocks.find((b) => b.id === "r1")
			?.attrs as { cells?: { title?: string } } | undefined
	)?.cells?.title;

it("renames a note's row when the note is renamed, with the database's note closed", async () => {
	const host = new MemoryHost();
	await loadVault(host);
	// "Dune" sorts before "Shelf", so it is the note on screen.
	const dune = await createNote(host, "", "Dune");
	await createNote(host, "", "Shelf", {
		blocks: shelfBlocks(dune.note.header.noteId),
	});
	render(<App host={host} />);
	const title = (await screen.findByRole("textbox", {
		name: "Title",
	})) as HTMLInputElement;
	await waitFor(() => expect(title.value).toBe("Dune"));
	fireEvent.change(title, { target: { value: "Dune (1965)" } });
	await waitFor(
		async () => expect(await rowName(host, "Shelf.vnote")).toBe("Dune (1965)"),
		{ timeout: 8000 },
	);
	expect(await host.kindOf("Dune (1965).vnote")).toBe("file");
}, 15000);

it("renames the note when its row is renamed, and not when the names already agree", async () => {
	const host = new MemoryHost();
	await loadVault(host);
	// "Alpha" sorts first, so the note being renamed is closed.
	const shelf = await createNote(host, "", "Alpha");
	const dune = await createNote(host, "", "Zeta");
	render(<App host={host} />);
	await waitFor(() => expect(links?.rowNotes).toBeTruthy());
	const write = vi.spyOn(host, "writeTextAtomic");
	act(() => links?.rowNotes?.rename(dune.note.header.noteId, "Zeta"));
	await new Promise((resolve) => setTimeout(resolve, 100));
	expect(write).not.toHaveBeenCalled();
	act(() => links?.rowNotes?.rename(dune.note.header.noteId, "Dune (1965)"));
	await waitFor(async () =>
		expect(await host.kindOf("Dune (1965).vnote")).toBe("file"),
	);
	expect(await host.kindOf("Zeta.vnote")).toBeNull();
	const renamed = (await loadNote(host, "Dune (1965).vnote")).note;
	expect(renamed?.header.title).toBe("Dune (1965)");
	expect(renamed?.header.noteId).toBe(dune.note.header.noteId);
	expect(shelf.path).toBe("Alpha.vnote");
});

it("says so when a database can't be updated, and leaves it as it was", async () => {
	const host = new MemoryHost();
	await loadVault(host);
	const dune = await createNote(host, "", "Dune");
	await createNote(host, "", "Shelf", {
		blocks: shelfBlocks(dune.note.header.noteId),
	});
	// The database's note was written by a newer version of the app: read-only.
	const text = await host.readText("Shelf.vnote");
	const newer = text.replace('"v":1', '"v":999');
	await host.writeTextAtomic("Shelf.vnote", newer);
	render(<App host={host} />);
	const title = (await screen.findByRole("textbox", {
		name: "Title",
	})) as HTMLInputElement;
	await waitFor(() => expect(title.value).toBe("Dune"));
	fireEvent.change(title, { target: { value: "Dune (1965)" } });
	const alert = await screen.findByText(
		/was not updated in "Shelf"/,
		undefined,
		{
			timeout: 8000,
		},
	);
	expect(alert.textContent).toContain("Dune (1965)");
	expect(await host.readText("Shelf.vnote")).toBe(newer);
}, 15000);

it("updates a database's rows even while that database's note is open, and keeps it open", async () => {
	const host = new MemoryHost();
	await loadVault(host);
	const zeta = await createNote(host, "", "Zeta");
	// "Alpha" sorts first, so the database's note is the one on screen.
	await createNote(host, "", "Alpha", {
		blocks: shelfBlocks(zeta.note.header.noteId, "Zeta"),
	});
	render(<App host={host} />);
	const title = (await screen.findByRole("textbox", {
		name: "Title",
	})) as HTMLInputElement;
	await waitFor(() => expect(title.value).toBe("Alpha"));
	act(() => links?.rowNotes?.rename(zeta.note.header.noteId, "Zeta 2"));
	await waitFor(
		async () => expect(await rowName(host, "Alpha.vnote")).toBe("Zeta 2"),
		{ timeout: 8000 },
	);
	expect(await host.kindOf("Zeta 2.vnote")).toBe("file");
	expect(
		(screen.getByRole("textbox", { name: "Title" }) as HTMLInputElement).value,
	).toBe("Alpha");
}, 15000);
