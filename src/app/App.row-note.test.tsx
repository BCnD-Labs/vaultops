// @vitest-environment happy-dom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
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
