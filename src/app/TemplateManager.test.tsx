// @vitest-environment happy-dom
import {
	act,
	cleanup,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Editor } from "@tiptap/core";
import { afterEach, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { Note } from "../core/note-format";
import {
	listTemplates,
	saveTemplate,
	TEMPLATES,
	type TemplateEntry,
} from "../core/notes/templates";
import { openVault } from "../core/vault/vault";
import { MemoryHost } from "../host/memory-host";
import type { NoteRow } from "./session";
import { TemplateManager } from "./TemplateManager";

// Radix Select needs pointer-capture and scrolling APIs that happy-dom lacks.
Object.assign(Element.prototype, {
	hasPointerCapture: () => false,
	setPointerCapture: () => {},
	releasePointerCapture: () => {},
	scrollIntoView: () => {},
});

const notify = vi.hoisted(() => vi.fn());
vi.mock("../ui/notify", () => ({ notify }));

afterEach(() => {
	cleanup();
	notify.mockReset();
});

const note = (text: string): Note => ({
	header: { format: "vaultops-note", v: 1, noteId: "n", title: "T" },
	blocks: [
		{
			id: "a",
			type: "paragraph",
			parent: null,
			content: [{ type: "text", text }],
		},
	],
});
const rows: NoteRow[] = [
	{
		path: "Alpha.vnote",
		title: "Alpha",
		preview: "",
		readOnly: false,
		tags: [],
	},
	{ path: "Beta.vnote", title: "Beta", preview: "", readOnly: false, tags: [] },
];

async function setup(
	seed: (host: MemoryHost) => Promise<void> = async () => {},
	writable = true,
	onNewNoteFromTemplate?: (entry: TemplateEntry) => void,
) {
	const host = new MemoryHost();
	await openVault(host);
	await seed(host);
	const onClose = vi.fn();
	render(
		<TooltipProvider>
			<TemplateManager
				host={host}
				notes={rows}
				writable={writable}
				open
				onClose={onClose}
				onNewNoteFromTemplate={onNewNoteFromTemplate}
			/>
		</TooltipProvider>,
	);
	return { host, onClose };
}

const user = () => userEvent.setup();
const editorOf = () =>
	(
		document.querySelector(".tpl-editor .ProseMirror") as unknown as {
			editor: Editor;
		}
	).editor;
const type = (text: string) =>
	act(() => {
		editorOf().commands.insertContent(text);
	});
const menu = async (
	u: ReturnType<typeof userEvent.setup>,
	name: string,
	item: string,
) => {
	await u.click(
		await screen.findByRole("button", { name: `Actions for ${name}` }),
	);
	await u.click(await screen.findByRole("menuitem", { name: item }));
};
const seedMeeting = async (host: MemoryHost) => {
	await saveTemplate(host, "Meeting", note("Agenda for {{title}}"), {
		folder: "Work",
	});
	await saveTemplate(host, "Standup", note("Daily"));
};

it("says there are no templates, and offers the three toolbar buttons", async () => {
	await setup();
	expect(await screen.findByText(/No templates yet/)).toBeTruthy();
	for (const name of ["New template", "New folder", "Refresh"]) {
		expect(screen.getByRole("button", { name })).toBeTruthy();
	}
	expect(screen.getByText("Choose a template to edit it.")).toBeTruthy();
});

it("uses the light backdrop and keeps the empty state in its own column", async () => {
	await setup();
	const empty = (await screen.findByText("Choose a template to edit it."))
		.parentElement;
	expect(empty?.className).toContain("tpl-empty");
	expect(
		document
			.querySelector('[data-slot="dialog-overlay"]')
			?.getAttribute("data-variant"),
	).toBe("light");
});

it("lists folders and templates as a tree, and folds a folder", async () => {
	const u = user();
	await setup(seedMeeting);
	expect(await screen.findByRole("treeitem", { name: "Work" })).toBeTruthy();
	expect(screen.getByRole("treeitem", { name: "Meeting" })).toBeTruthy();
	expect(screen.getByRole("treeitem", { name: "Standup" })).toBeTruthy();
	await u.click(screen.getByRole("treeitem", { name: "Work" }));
	expect(screen.queryByRole("treeitem", { name: "Meeting" })).toBeNull();
	await u.click(screen.getByRole("treeitem", { name: "Work" }));
	expect(screen.getByRole("treeitem", { name: "Meeting" })).toBeTruthy();
});

it("searches by name or path, keeping the folder of a match", async () => {
	const u = user();
	await setup(seedMeeting);
	await screen.findByRole("treeitem", { name: "Standup" });
	await u.type(
		screen.getByRole("textbox", { name: "Search templates by name or path" }),
		"work/meet",
	);
	expect(screen.getByRole("treeitem", { name: "Meeting" })).toBeTruthy();
	expect(screen.getByRole("treeitem", { name: "Work" })).toBeTruthy();
	expect(screen.queryByRole("treeitem", { name: "Standup" })).toBeNull();
});

it("shows the chosen template in an editor, with Save off until something changes", async () => {
	const u = user();
	await setup(seedMeeting);
	await u.click(await screen.findByRole("treeitem", { name: "Meeting" }));
	expect(await screen.findByText("Work/Meeting")).toBeTruthy();
	expect(editorOf().state.doc.textContent).toBe("Agenda for {{title}}");
	expect(
		(screen.getByRole("button", { name: "Save" }) as HTMLButtonElement)
			.disabled,
	).toBe(true);
});

it("makes a new template from a name and opens it for editing", async () => {
	const u = user();
	const { host } = await setup();
	await u.click(screen.getByRole("button", { name: "New template" }));
	await u.type(
		await screen.findByRole("textbox", { name: "Template name" }),
		"Weekly review",
	);
	await u.click(screen.getByRole("button", { name: "Create" }));
	await waitFor(() =>
		expect(
			screen.getByText("Weekly review", { selector: "strong" }),
		).toBeTruthy(),
	);
	expect((await listTemplates(host)).templates.map((t) => t.label)).toEqual([
		"Weekly review",
	]);
	expect(editorOf()).toBeTruthy();
});

it("refuses a name that is already used, and says why", async () => {
	const u = user();
	const { host } = await setup(seedMeeting);
	await u.click(await screen.findByRole("button", { name: "New template" }));
	await u.type(
		await screen.findByRole("textbox", { name: "Template name" }),
		"standup",
	);
	await u.click(screen.getByRole("button", { name: "Create" }));
	expect(await screen.findByRole("alert")).toBeTruthy();
	expect(screen.getByText(/already exists/)).toBeTruthy();
	expect((await listTemplates(host)).templates).toHaveLength(2);
});

it("makes a folder, and a template inside a folder from its menu", async () => {
	const u = user();
	const { host } = await setup();
	await u.click(screen.getByRole("button", { name: "New folder" }));
	await u.type(
		await screen.findByRole("textbox", { name: "Folder name" }),
		"School",
	);
	await u.click(screen.getByRole("button", { name: "Create" }));
	await screen.findByRole("treeitem", { name: "School" });
	await menu(u, "School", "New template here");
	await u.type(
		await screen.findByRole("textbox", { name: "Template name" }),
		"Lecture",
	);
	await u.click(screen.getByRole("button", { name: "Create" }));
	await waitFor(async () =>
		expect((await listTemplates(host)).templates.map((t) => t.label)).toEqual([
			"School/Lecture",
		]),
	);
});

it("saves edits to the template file", async () => {
	const u = user();
	const { host } = await setup(seedMeeting);
	await u.click(await screen.findByRole("treeitem", { name: "Standup" }));
	await screen.findByText("Standup", { selector: "strong" });
	type(" more");
	expect(await screen.findByText("Unsaved changes")).toBeTruthy();
	await u.click(screen.getByRole("button", { name: "Save" }));
	await waitFor(() => expect(screen.queryByText("Unsaved changes")).toBeNull());
	expect(notify).toHaveBeenCalledWith('Saved "Standup".');
	expect(screen.queryByRole("status")).toBeNull();
	const standup = (await listTemplates(host)).templates.find(
		(t) => t.name === "Standup",
	);
	expect(standup?.preview).toContain("Daily");
	expect(standup?.preview).toContain("more");
});

it("asks before dropping unsaved edits, and keeps them if you say keep editing", async () => {
	const u = user();
	const { host } = await setup(seedMeeting);
	await u.click(await screen.findByRole("treeitem", { name: "Standup" }));
	await screen.findByText("Standup", { selector: "strong" });
	type(" more");
	await u.click(screen.getByRole("treeitem", { name: "Meeting" }));
	const ask = await screen.findByRole("alertdialog");
	expect(within(ask).getByText("Discard your changes?")).toBeTruthy();
	await u.click(within(ask).getByRole("button", { name: "Keep editing" }));
	expect(screen.getByText("Standup", { selector: "strong" })).toBeTruthy();
	expect(editorOf().state.doc.textContent).toContain("more");
	await u.click(screen.getByRole("treeitem", { name: "Meeting" }));
	await u.click(await screen.findByRole("button", { name: "Discard changes" }));
	expect(
		await screen.findByText("Work/Meeting", { selector: "strong" }),
	).toBeTruthy();
	// Nothing reached the file.
	expect(
		(await listTemplates(host)).templates.find((t) => t.name === "Standup")
			?.preview,
	).toBe("Daily");
});

it("asks before closing with unsaved edits", async () => {
	const u = user();
	const { onClose } = await setup(seedMeeting);
	await u.click(await screen.findByRole("treeitem", { name: "Standup" }));
	await screen.findByText("Standup", { selector: "strong" });
	type("!");
	await u.keyboard("{Escape}");
	expect(onClose).not.toHaveBeenCalled();
	await u.click(await screen.findByRole("button", { name: "Discard changes" }));
	expect(onClose).toHaveBeenCalledTimes(1);
});

it("renames a template, keeping it chosen", async () => {
	const u = user();
	const { host } = await setup(seedMeeting);
	await u.click(await screen.findByRole("treeitem", { name: "Standup" }));
	await menu(u, "Standup", "Rename");
	const box = await screen.findByRole("textbox", { name: "Template name" });
	await u.clear(box);
	await u.type(box, "Daily");
	await u.click(screen.getByRole("button", { name: "Rename" }));
	await screen.findByRole("treeitem", { name: "Daily" });
	expect(screen.getByText("Daily", { selector: "strong" })).toBeTruthy();
	expect(notify).toHaveBeenCalledWith('Renamed "Standup" to "Daily".');
	expect((await listTemplates(host)).templates.map((t) => t.label)).toEqual(
		["Work/Meeting", "Daily"].sort(),
	);
});

it("duplicates a template next to itself", async () => {
	const u = user();
	const { host } = await setup(seedMeeting);
	await menu(u, "Standup", "Duplicate");
	await screen.findByRole("treeitem", { name: "Standup copy" });
	expect(notify).toHaveBeenCalledWith('Duplicated "Standup".');
	expect((await listTemplates(host)).templates.map((t) => t.label)).toContain(
		"Standup copy",
	);
});

it("deletes only after asking, and keeps the file in recovery", async () => {
	const u = user();
	const { host } = await setup(seedMeeting);
	await menu(u, "Standup", "Delete");
	const ask = await screen.findByRole("alertdialog");
	expect(within(ask).getByText(/not erased/)).toBeTruthy();
	await u.click(within(ask).getByRole("button", { name: "Cancel" }));
	expect((await listTemplates(host)).templates).toHaveLength(2);
	await menu(u, "Standup", "Delete");
	await u.click(
		within(await screen.findByRole("alertdialog")).getByRole("button", {
			name: "Delete",
		}),
	);
	await waitFor(() =>
		expect(screen.queryByRole("treeitem", { name: "Standup" })).toBeNull(),
	);
	expect((await listTemplates(host)).templates.map((t) => t.name)).toEqual([
		"Meeting",
	]);
	expect(notify).toHaveBeenCalledWith(
		'Moved "Standup" to the recovery folder.',
	);
	const recovered = (await host.list(".vaultops/recovery")).map((e) => e.name);
	expect(recovered).toHaveLength(1);
	expect(
		await host.kindOf(
			`.vaultops/recovery/${recovered[0]}/templates/Standup.vnote`,
		),
	).toBe("file");
});

it("deletes a folder with what is in it, also into recovery", async () => {
	const u = user();
	const { host } = await setup(seedMeeting);
	await menu(u, "Work", "Delete");
	await u.click(
		within(await screen.findByRole("alertdialog")).getByRole("button", {
			name: "Delete",
		}),
	);
	await waitFor(() =>
		expect(screen.queryByRole("treeitem", { name: "Work" })).toBeNull(),
	);
	const recovered = (await host.list(".vaultops/recovery")).map((e) => e.name);
	expect(
		await host.kindOf(
			`.vaultops/recovery/${recovered[0]}/templates/Work/Meeting.vnote`,
		),
	).toBe("file");
	expect(await host.kindOf(`${TEMPLATES}/Work`)).toBeNull();
	expect(notify).toHaveBeenCalledWith(
		'Moved the folder "Work" and its templates to the recovery folder.',
	);
});

it("shows Loading templates… until the list arrives", async () => {
	const host = new MemoryHost();
	await openVault(host);
	let release: () => void = () => {};
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	const list = host.list.bind(host);
	vi.spyOn(host, "list").mockImplementation(async (path) => {
		await gate;
		return list(path);
	});
	render(
		<TooltipProvider>
			<TemplateManager
				host={host}
				notes={rows}
				writable
				open
				onClose={() => {}}
			/>
		</TooltipProvider>,
	);
	expect(screen.getByText("Loading templates…")).toBeTruthy();
	release();
	await waitFor(() =>
		expect(screen.queryByText("Loading templates…")).toBeNull(),
	);
});

it("keeps a failed save inline as an alert and does not toast it", async () => {
	const u = user();
	const { host } = await setup(seedMeeting);
	await u.click(await screen.findByRole("treeitem", { name: "Standup" }));
	await screen.findByText("Standup", { selector: "strong" });
	type(" more");
	vi.spyOn(host, "writeTextAtomic").mockRejectedValue(new Error("disk full"));
	await u.click(screen.getByRole("button", { name: "Save" }));
	const alert = await screen.findByRole("alert");
	expect(alert.textContent).toContain("disk full");
	expect(notify).not.toHaveBeenCalled();
});

it("previews the template filled in with the document you pick, without changing anything", async () => {
	const u = user();
	const { host } = await setup(seedMeeting);
	await u.click(await screen.findByRole("treeitem", { name: "Meeting" }));
	await screen.findByText("Work/Meeting", { selector: "strong" });
	await u.click(screen.getByRole("combobox", { name: "Preview context" }));
	await u.click(await screen.findByRole("option", { name: "Beta" }));
	await u.click(screen.getByRole("button", { name: "Preview template" }));
	const preview = await screen.findByRole("region", {
		name: "Template preview",
	});
	expect(preview.textContent).toContain("Agenda for Beta");
	expect(
		(await listTemplates(host)).templates.find((t) => t.name === "Meeting")
			?.preview,
	).toBe("Agenda for {{title}}");
});

it("previews with Untitled when no document is chosen", async () => {
	const u = user();
	await setup(seedMeeting);
	await u.click(await screen.findByRole("treeitem", { name: "Meeting" }));
	await screen.findByText("Work/Meeting", { selector: "strong" });
	await u.click(screen.getByRole("button", { name: "Preview template" }));
	expect(
		(await screen.findByRole("region", { name: "Template preview" }))
			.textContent,
	).toContain("Agenda for Untitled");
});

it("only lets you look in a read-only vault", async () => {
	const u = user();
	await setup(seedMeeting, false);
	await u.click(await screen.findByRole("treeitem", { name: "Standup" }));
	expect(
		(screen.getByRole("button", { name: "New template" }) as HTMLButtonElement)
			.disabled,
	).toBe(true);
	expect(
		(screen.getByRole("button", { name: "New folder" }) as HTMLButtonElement)
			.disabled,
	).toBe(true);
	expect(
		screen.queryByRole("button", { name: "Actions for Standup" }),
	).toBeNull();
	expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
	expect(screen.getByText(/read-only/)).toBeTruthy();
});

it("shows a template it can't read, with the reason, and lets it be deleted", async () => {
	const u = user();
	const { host } = await setup(async (h) => {
		await h.makeFolder(TEMPLATES);
		await h.writeTextAtomic(`${TEMPLATES}/Broken.vnote`, "junk");
	});
	await u.click(await screen.findByRole("treeitem", { name: "Broken" }));
	expect(await screen.findByText(/could not be read/)).toBeTruthy();
	expect(
		(
			screen.getByRole("button", {
				name: "Preview template",
			}) as HTMLButtonElement
		).disabled,
	).toBe(true);
	await menu(u, "Broken", "Delete");
	await u.click(
		within(await screen.findByRole("alertdialog")).getByRole("button", {
			name: "Delete",
		}),
	);
	await waitFor(() =>
		expect(screen.queryByRole("treeitem", { name: "Broken" })).toBeNull(),
	);
	expect(await host.kindOf(`${TEMPLATES}/Broken.vnote`)).toBeNull();
});

const newNoteButton = () =>
	screen.getByRole("button", {
		name: "New note from this template",
	}) as HTMLButtonElement;

it("offers New note from this template only when the app can act on it", async () => {
	const u = user();
	await setup(seedMeeting);
	await u.click(await screen.findByRole("treeitem", { name: "Standup" }));
	await screen.findByText("Standup", { selector: "strong" });
	expect(
		screen.queryByRole("button", { name: "New note from this template" }),
	).toBeNull();
});

it("hands the chosen template to the app", async () => {
	const u = user();
	const make = vi.fn();
	await setup(seedMeeting, true, make);
	await u.click(await screen.findByRole("treeitem", { name: "Standup" }));
	await screen.findByText("Standup", { selector: "strong" });
	await u.click(newNoteButton());
	expect(make).toHaveBeenCalledTimes(1);
	expect(make.mock.calls[0]?.[0]).toMatchObject({
		name: "Standup",
		path: `${TEMPLATES}/Standup.vnote`,
	});
});

it("asks about unsaved edits first, and only goes on once they are discarded", async () => {
	const u = user();
	const make = vi.fn();
	await setup(seedMeeting, true, make);
	await u.click(await screen.findByRole("treeitem", { name: "Standup" }));
	await screen.findByText("Standup", { selector: "strong" });
	type(" more");
	await u.click(newNoteButton());
	const ask = await screen.findByRole("alertdialog");
	expect(make).not.toHaveBeenCalled();
	await u.click(within(ask).getByRole("button", { name: "Keep editing" }));
	expect(make).not.toHaveBeenCalled();
	await u.click(newNoteButton());
	await u.click(await screen.findByRole("button", { name: "Discard changes" }));
	expect(make).toHaveBeenCalledTimes(1);
});

it("is off in a read-only vault and for a template that can't be read", async () => {
	const u = user();
	const make = vi.fn();
	await setup(
		async (h) => {
			await seedMeeting(h);
			await h.writeTextAtomic(`${TEMPLATES}/Broken.vnote`, "junk");
		},
		false,
		make,
	);
	await u.click(await screen.findByRole("treeitem", { name: "Standup" }));
	await screen.findByText("Standup", { selector: "strong" });
	expect(newNoteButton().disabled).toBe(true);
	cleanup();
	await setup(
		async (h) => {
			await h.makeFolder(TEMPLATES);
			await h.writeTextAtomic(`${TEMPLATES}/Broken.vnote`, "junk");
		},
		true,
		make,
	);
	await u.click(await screen.findByRole("treeitem", { name: "Broken" }));
	await screen.findByText(/could not be read/);
	expect(newNoteButton().disabled).toBe(true);
	expect(make).not.toHaveBeenCalled();
});

const focusedName = () =>
	(document.activeElement as HTMLElement | null)?.textContent ?? "";

it("is an ARIA tree: roles, levels, expanded state and one Tab stop", async () => {
	await setup(seedMeeting);
	const tree = await screen.findByRole("tree", { name: "Templates" });
	const work = within(tree).getByRole("treeitem", { name: "Work" });
	expect(work.getAttribute("aria-expanded")).toBe("true");
	expect(work.getAttribute("aria-level")).toBe("1");
	const meeting = within(tree).getByRole("treeitem", { name: "Meeting" });
	expect(meeting.getAttribute("aria-level")).toBe("2");
	expect(meeting.getAttribute("aria-selected")).toBe("false");
	expect(within(tree).getByRole("group")).toBeTruthy();
	const all = within(tree).getAllByRole("treeitem");
	expect(all.filter((row) => row.tabIndex === 0)).toEqual([work]);
	for (const more of within(tree).getAllByRole("button", {
		name: /^Actions for/,
	}))
		expect(more.tabIndex).toBe(-1);
});

it("walks the tree with arrows: open, close, child, parent, collapsed rows skipped", async () => {
	const u = user();
	await setup(seedMeeting);
	const work = await screen.findByRole("treeitem", { name: "Work" });
	work.focus();
	await u.keyboard("{ArrowRight}");
	expect(focusedName()).toBe("Meeting");
	await u.keyboard("{ArrowDown}");
	expect(focusedName()).toBe("Standup");
	await u.keyboard("{ArrowUp}{ArrowLeft}");
	expect(document.activeElement).toBe(work);
	await u.keyboard("{ArrowLeft}");
	expect(work.getAttribute("aria-expanded")).toBe("false");
	expect(screen.queryByRole("treeitem", { name: "Meeting" })).toBeNull();
	await u.keyboard("{ArrowDown}");
	expect(focusedName()).toBe("Standup");
	await u.keyboard("{ArrowUp}{ArrowRight}");
	expect(work.getAttribute("aria-expanded")).toBe("true");
	expect(document.activeElement).toBe(work);
	await u.keyboard("{End}");
	expect(focusedName()).toBe("Standup");
	await u.keyboard("{Home}");
	expect(document.activeElement).toBe(work);
	// Moving did not choose anything; Enter does.
	expect(screen.queryByText("Choose a template to edit it.")).toBeTruthy();
	await u.keyboard("{ArrowDown}{Enter}");
	await waitFor(() =>
		expect(
			screen
				.getByRole("treeitem", { name: "Meeting" })
				.getAttribute("aria-selected"),
		).toBe("true"),
	);
});

it("leaves arrow keys alone in the search box", async () => {
	const u = user();
	await setup(seedMeeting);
	await screen.findByRole("treeitem", { name: "Standup" });
	const search = screen.getByRole("textbox", {
		name: "Search templates by name or path",
	});
	await u.click(search);
	await u.keyboard("{ArrowDown}{End}{ArrowLeft}");
	expect(document.activeElement).toBe(search);
});

it("opens a row's actions from the keyboard and returns to the row", async () => {
	const u = user();
	await setup(seedMeeting);
	const standup = await screen.findByRole("treeitem", { name: "Standup" });
	standup.focus();
	await u.keyboard("{Shift>}{F10}{/Shift}");
	expect(await screen.findByRole("menuitem", { name: "Rename" })).toBeTruthy();
	await u.keyboard("{Escape}");
	await waitFor(() => expect(document.activeElement).toBe(standup));
});

it("puts focus on the next row after deleting a template, and on a duplicate", async () => {
	const u = user();
	await setup(seedMeeting);
	await menu(u, "Standup", "Duplicate");
	await screen.findByRole("treeitem", { name: "Standup copy" });
	await waitFor(() => expect(focusedName()).toBe("Standup copy"));
	await menu(u, "Standup copy", "Delete");
	await u.click(
		within(await screen.findByRole("alertdialog")).getByRole("button", {
			name: "Delete",
		}),
	);
	await waitFor(() =>
		expect(screen.queryByRole("treeitem", { name: "Standup copy" })).toBeNull(),
	);
	await waitFor(() => expect(focusedName()).toBe("Standup"));
});

it("puts focus on a renamed template", async () => {
	const u = user();
	await setup(seedMeeting);
	await menu(u, "Standup", "Rename");
	const box = await screen.findByRole("textbox", { name: "Template name" });
	await u.clear(box);
	await u.type(box, "Daily");
	await u.click(screen.getByRole("button", { name: "Rename" }));
	await screen.findByRole("treeitem", { name: "Daily" });
	await waitFor(() => expect(focusedName()).toBe("Daily"));
});

it("makes the row menu trigger a ghost icon Button that stays out of the Tab order", async () => {
	await setup(seedMeeting);
	const more = await screen.findByRole("button", {
		name: "Actions for Standup",
	});
	expect(more.getAttribute("data-slot")).toBe("button");
	expect(more.getAttribute("data-variant")).toBe("ghost");
	expect(more.tabIndex).toBe(-1);
});
