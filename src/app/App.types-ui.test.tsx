// @vitest-environment happy-dom
import {
	cleanup,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Note } from "../core/note-format";
import { headerProps } from "../core/notes/properties";
import { createNote, loadNote } from "../core/notes/repository";
import { saveTemplate } from "../core/notes/templates";
import { typeIdOf } from "../core/types/apply";
import { MemoryHost } from "../host/memory-host";
import { App } from "./App";
import { loadVault } from "./session";

vi.mock("../ui/notify", () => ({ notify: vi.fn() }));

beforeEach(() => localStorage.setItem("vaultops:sidebar-mode", "navigator"));
afterEach(() => {
	cleanup();
	localStorage.clear();
});

const review: Note = {
	header: { format: "vaultops-note", v: 1, noteId: "t", title: "Review" },
	blocks: [
		{
			id: "a",
			type: "paragraph",
			parent: null,
			content: [{ type: "text", text: "What I thought" }],
		},
	],
};

const typesFile = JSON.stringify({
	format: "vaultops-resource-types",
	v: 2,
	types: [
		{
			id: "book",
			name: "Book",
			titleLabel: "Title",
			folder: "Library",
			template: "Review",
			fields: [
				{ label: "Author", kind: "text", required: false },
				{
					label: "Status",
					kind: "select",
					required: false,
					options: ["To read", "Done"],
				},
			],
		},
	],
});

async function openApp() {
	const host = new MemoryHost();
	await loadVault(host);
	await host.makeFolder(".vaultops/resources");
	await host.writeTextAtomic(".vaultops/resources/types.json", typesFile);
	await createNote(host, "", "Alpha");
	await saveTemplate(host, "Review", review);
	render(<App host={host} />);
	await screen.findByRole("textbox", { name: "Title" });
	return host;
}

it("makes a Book from the command bar: type's folder, fields, template, answers", async () => {
	const host = await openApp();
	const u = userEvent.setup();
	await u.click(screen.getByRole("button", { name: "Find or create a note" }));
	await u.click(await screen.findByRole("option", { name: /New Book/ }));
	const dialog = await screen.findByRole("dialog", { name: "New Book" });
	await u.type(
		within(dialog).getByRole("textbox", { name: "Author" }),
		"Herbert",
	);
	await u.click(within(dialog).getByRole("button", { name: "Continue" }));
	await waitFor(async () => {
		const { note } = await loadNote(host, "Library/Untitled Book.vnote");
		expect(note).not.toBeNull();
	});
	const { note } = await loadNote(host, "Library/Untitled Book.vnote");
	if (!note) throw new Error("no note");
	expect(typeIdOf(note.header)).toBe("book");
	expect(headerProps(note.header)).toEqual({
		Author: { type: "text", value: "Herbert" },
		Status: { type: "select", value: null, options: ["To read", "Done"] },
	});
	expect(note.blocks[0]?.content).toEqual([
		{ type: "text", text: "What I thought" },
	]);
});

// The Properties block under the title (the sidebar tab shows the same rows).
const block = () =>
	within(document.querySelector<HTMLElement>(".props-block") as HTMLElement);

it("sets, flags and removes a type on an open note through the editor", async () => {
	const host = await openApp();
	const u = userEvent.setup();
	for (const name of ["Mood", "Status"]) {
		await u.click(block().getByRole("button", { name: "Add property" }));
		await u.click(
			await screen.findByRole("button", { name: "Add Text property" }),
		);
		const field = await screen.findByRole("textbox", { name: "Property name" });
		await u.clear(field);
		await u.type(field, `${name}{Enter}`);
		await u.keyboard("{Escape}");
	}
	await u.click(block().getByRole("button", { name: "Note type" }));
	await u.click(await screen.findByRole("menuitemradio", { name: "Book" }));
	// The clashing text property is kept and flagged; the missing field is added.
	expect(await block().findByText("doesn't match the type")).toBeTruthy();
	expect(block().getByRole("textbox", { name: "Author" })).toBeTruthy();
	expect(block().getByText("Other properties")).toBeTruthy();
	await waitFor(async () => {
		const { note } = await loadNote(host, "Alpha.vnote");
		expect(note && typeIdOf(note.header)).toBe("book");
	});
	// The template goes in only when asked for, through the open editor.
	await u.click(
		block().getByRole("button", { name: "Insert the type's template" }),
	);
	await waitFor(async () => {
		const { note } = await loadNote(host, "Alpha.vnote");
		expect(JSON.stringify(note?.blocks)).toContain("What I thought");
	});
	await u.click(block().getByRole("button", { name: "Note type" }));
	await u.click(await screen.findByRole("menuitem", { name: "Remove type" }));
	await waitFor(async () => {
		const { note } = await loadNote(host, "Alpha.vnote");
		expect(note && typeIdOf(note.header)).toBeNull();
		expect(headerProps(note?.header)).toHaveProperty("Author");
	});
});
