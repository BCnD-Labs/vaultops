// @vitest-environment happy-dom
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Editor } from "@tiptap/core";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Note } from "../core/note-format";
import { createNote, loadNote } from "../core/notes/repository";
import { saveTemplate } from "../core/notes/templates";
import { shortcutKey } from "../core/settings/shortcuts";
import { MemoryHost } from "../host/memory-host";
import { App } from "./App";
import { loadVault } from "./session";
import { settings } from "./settings";

const notify = vi.hoisted(() => vi.fn());
vi.mock("../ui/notify", () => ({ notify }));

beforeEach(() => {
	localStorage.setItem("vaultops:sidebar-mode", "navigator");
	(settings.set as (key: string, value: unknown) => unknown)(
		shortcutKey("open-templates"),
		"Ctrl+Alt+T",
	);
});
afterEach(() => {
	cleanup();
	localStorage.clear();
	notify.mockClear();
	(settings.set as (key: string, value: unknown) => unknown)(
		shortcutKey("open-templates"),
		"",
	);
});

const template: Note = {
	header: { format: "vaultops-note", v: 1, noteId: "t", title: "Meeting" },
	blocks: [
		{
			id: "a",
			type: "paragraph",
			parent: null,
			content: [{ type: "text", text: "Agenda for {{title}}" }],
		},
	],
};

async function openApp(folder: string, source = template) {
	const host = new MemoryHost();
	await loadVault(host);
	await host.makeFolder(folder);
	await createNote(host, folder, "Alpha");
	await saveTemplate(host, "Meeting", source);
	render(<App host={host} />);
	await screen.findByRole("textbox", { name: "Title" });
	act(() => {
		fireEvent.keyDown(window, {
			key: "T",
			code: "KeyT",
			ctrlKey: true,
			altKey: true,
		});
	});
	return host;
}

it("makes a note from a template in the current folder, opens it and closes the manager", async () => {
	const host = await openApp("Work");
	const u = userEvent.setup();
	const manager = await screen.findByRole("dialog", {
		name: "Template manager",
	});
	await u.click(
		await within(manager).findByRole("treeitem", { name: "Meeting" }),
	);
	await u.click(
		await within(manager).findByRole("button", {
			name: "New note from this template",
		}),
	);
	await waitFor(() =>
		expect(
			screen.queryByRole("dialog", { name: "Template manager" }),
		).toBeNull(),
	);
	await waitFor(() =>
		expect(notify).toHaveBeenCalledWith('Created "Meeting" from the template.'),
	);
	const { note } = await loadNote(host, "Work/Meeting.vnote");
	if (!note) throw new Error("note not readable");
	expect(note.header.title).toBe("Meeting");
	expect(note.blocks).toHaveLength(1);
	expect(note.blocks[0]?.content).toEqual([
		{ type: "text", text: "Agenda for Meeting" },
	]);
	// Fresh ids: the template's block id is not reused.
	expect(note.blocks[0]?.id).not.toBe("a");
	expect(
		(
			(await screen.findByRole("textbox", {
				name: "Title",
			})) as HTMLInputElement
		).value,
	).toBe("Meeting");
});

it("fills the title, body and properties, then opens the note at the cursor", async () => {
	const host = await openApp("Work", {
		header: {
			...template.header,
			titleTemplate: "Plan for {{?Client}}",
			props: { Client: { type: "text", value: "" } },
		},
		blocks: [
			{
				id: "a",
				type: "paragraph",
				parent: null,
				content: [
					{ type: "text", text: "{{prompt:Client|text|Ada}}" },
					{ type: "text", text: "{{cursor}}", marks: [{ type: "bold" }] },
					{ type: "text", text: "!" },
				],
			},
		],
	});
	const u = userEvent.setup();
	await u.click(await screen.findByRole("treeitem", { name: "Meeting" }));
	await u.click(
		screen.getByRole("button", { name: "New note from this template" }),
	);
	const input = await screen.findByRole<HTMLInputElement>("textbox", {
		name: "Client",
	});
	expect(input.value).toBe("Ada");
	expect(document.activeElement).toBe(input);
	await u.clear(input);
	await u.type(input, "Grace{Enter}");
	await waitFor(() => {
		const field = document.activeElement as
			| (HTMLElement & { editor?: Editor })
			| null;
		expect(field?.editor?.state.doc.textContent).toBe("Grace!");
		expect(field?.editor?.state.selection.$from.parentOffset).toBe(5);
	});
	const { note } = await loadNote(host, "Work/Plan for Grace.vnote");
	expect(note?.header.title).toBe("Plan for Grace");
	expect(note?.header.props).toEqual({
		Client: { type: "text", value: "Grace" },
	});
});
