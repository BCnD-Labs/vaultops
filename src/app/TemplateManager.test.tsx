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
} from "../core/notes/templates";
import { openVault } from "../core/vault/vault";
import { MemoryHost } from "../host/memory-host";
import type { NoteRow } from "./session";
import { TemplateManager } from "./TemplateManager";

afterEach(cleanup);

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
	expect(await screen.findByRole("button", { name: "Work" })).toBeTruthy();
	expect(screen.getByRole("button", { name: "Meeting" })).toBeTruthy();
	expect(screen.getByRole("button", { name: "Standup" })).toBeTruthy();
	await u.click(screen.getByRole("button", { name: "Work" }));
	expect(screen.queryByRole("button", { name: "Meeting" })).toBeNull();
	await u.click(screen.getByRole("button", { name: "Work" }));
	expect(screen.getByRole("button", { name: "Meeting" })).toBeTruthy();
});

it("searches by name or path, keeping the folder of a match", async () => {
	const u = user();
	await setup(seedMeeting);
	await screen.findByRole("button", { name: "Standup" });
	await u.type(
		screen.getByRole("textbox", { name: "Search templates by name or path" }),
		"work/meet",
	);
	expect(screen.getByRole("button", { name: "Meeting" })).toBeTruthy();
	expect(screen.getByRole("button", { name: "Work" })).toBeTruthy();
	expect(screen.queryByRole("button", { name: "Standup" })).toBeNull();
});

it("shows the chosen template in an editor, with Save off until something changes", async () => {
	const u = user();
	await setup(seedMeeting);
	await u.click(await screen.findByRole("button", { name: "Meeting" }));
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
	await screen.findByRole("button", { name: "School" });
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
	await u.click(await screen.findByRole("button", { name: "Standup" }));
	await screen.findByText("Standup", { selector: "strong" });
	type(" more");
	expect(await screen.findByText("Unsaved changes")).toBeTruthy();
	await u.click(screen.getByRole("button", { name: "Save" }));
	await waitFor(() => expect(screen.queryByText("Unsaved changes")).toBeNull());
	const standup = (await listTemplates(host)).templates.find(
		(t) => t.name === "Standup",
	);
	expect(standup?.preview).toContain("Daily");
	expect(standup?.preview).toContain("more");
});

it("asks before dropping unsaved edits, and keeps them if you say keep editing", async () => {
	const u = user();
	const { host } = await setup(seedMeeting);
	await u.click(await screen.findByRole("button", { name: "Standup" }));
	await screen.findByText("Standup", { selector: "strong" });
	type(" more");
	await u.click(screen.getByRole("button", { name: "Meeting" }));
	const ask = await screen.findByRole("alertdialog");
	expect(within(ask).getByText("Discard your changes?")).toBeTruthy();
	await u.click(within(ask).getByRole("button", { name: "Keep editing" }));
	expect(screen.getByText("Standup", { selector: "strong" })).toBeTruthy();
	expect(editorOf().state.doc.textContent).toContain("more");
	await u.click(screen.getByRole("button", { name: "Meeting" }));
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
	await u.click(await screen.findByRole("button", { name: "Standup" }));
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
	await u.click(await screen.findByRole("button", { name: "Standup" }));
	await menu(u, "Standup", "Rename");
	const box = await screen.findByRole("textbox", { name: "Template name" });
	await u.clear(box);
	await u.type(box, "Daily");
	await u.click(screen.getByRole("button", { name: "Rename" }));
	await screen.findByRole("button", { name: "Daily" });
	expect(screen.getByText("Daily", { selector: "strong" })).toBeTruthy();
	expect((await listTemplates(host)).templates.map((t) => t.label)).toEqual(
		["Work/Meeting", "Daily"].sort(),
	);
});

it("duplicates a template next to itself", async () => {
	const u = user();
	const { host } = await setup(seedMeeting);
	await menu(u, "Standup", "Duplicate");
	await screen.findByRole("button", { name: "Standup copy" });
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
		expect(screen.queryByRole("button", { name: "Standup" })).toBeNull(),
	);
	expect((await listTemplates(host)).templates.map((t) => t.name)).toEqual([
		"Meeting",
	]);
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
		expect(screen.queryByRole("button", { name: "Work" })).toBeNull(),
	);
	const recovered = (await host.list(".vaultops/recovery")).map((e) => e.name);
	expect(
		await host.kindOf(
			`.vaultops/recovery/${recovered[0]}/templates/Work/Meeting.vnote`,
		),
	).toBe("file");
	expect(await host.kindOf(`${TEMPLATES}/Work`)).toBeNull();
});

it("previews the template filled in with the document you pick, without changing anything", async () => {
	const u = user();
	const { host } = await setup(seedMeeting);
	await u.click(await screen.findByRole("button", { name: "Meeting" }));
	await screen.findByText("Work/Meeting", { selector: "strong" });
	await u.selectOptions(
		screen.getByRole("combobox", { name: "Preview context" }),
		"Beta",
	);
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
	await u.click(await screen.findByRole("button", { name: "Meeting" }));
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
	await u.click(await screen.findByRole("button", { name: "Standup" }));
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
	await u.click(await screen.findByRole("button", { name: "Broken" }));
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
		expect(screen.queryByRole("button", { name: "Broken" })).toBeNull(),
	);
	expect(await host.kindOf(`${TEMPLATES}/Broken.vnote`)).toBeNull();
});
