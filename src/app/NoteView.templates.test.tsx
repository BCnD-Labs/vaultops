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
import { createNote } from "../core/notes/repository";
import { listTemplates, saveTemplate } from "../core/notes/templates";
import { TEMPLATE_EVENT } from "../editor/slash-items";
import { MemoryHost } from "../host/memory-host";
import { SessionNoteView } from "./NoteView";
import { loadVault } from "./session";
import { useWorkspaceHost, type WorkspaceHost } from "./useWorkspaceHost";
import { WorkspacePanes } from "./WorkspacePanes";

afterEach(cleanup);

let api: WorkspaceHost;
const onManage = vi.fn();

function Harness({
	host,
	rows,
	writable,
	reading,
}: {
	host: MemoryHost;
	rows: Awaited<ReturnType<typeof loadVault>>["notes"];
	writable: boolean;
	reading: boolean;
}) {
	api = useWorkspaceHost({
		host,
		writable,
		isCanvas: () => false,
		onSaved: () => {},
		onUnsaved: () => {},
		onError: () => {},
	});
	return (
		<TooltipProvider>
			<WorkspacePanes
				host={api}
				notes={rows}
				renderNote={(pane) => (
					<SessionNoteView
						session={pane.session}
						writable={writable}
						reading={reading}
						onToggleReading={() => {}}
						onLoadDisk={() => {}}
						onSaveCopy={() => {}}
						onMoveToTrash={() => {}}
						templates={{ host, onManage }}
					/>
				)}
				renderCanvas={() => null}
				renderEmpty={() => <p>Empty</p>}
			/>
		</TooltipProvider>
	);
}

const template = (text: string): Note => ({
	header: { format: "vaultops-note", v: 1, noteId: "t", title: "T" },
	blocks: [
		{
			id: "h",
			type: "heading",
			parent: null,
			content: [{ type: "text", text: "{{title}}" }],
		},
		{
			id: "p",
			type: "paragraph",
			parent: null,
			content: [{ type: "text", text }],
		},
	],
});

async function setup(opts: { writable?: boolean; reading?: boolean } = {}) {
	const host = new MemoryHost();
	await loadVault(host);
	const path = (await createNote(host, "", "Alpha")).path;
	await saveTemplate(host, "Meeting", template("Agenda"), { folder: "Work" });
	const rows = (await loadVault(host)).notes;
	render(
		<Harness
			host={host}
			rows={rows}
			writable={opts.writable ?? true}
			reading={opts.reading ?? false}
		/>,
	);
	await act(async () => {
		expect(await api.open(path)).toBe(true);
	});
	await screen.findByRole("textbox", { name: "Title" });
	const dom = () => document.querySelector(".ProseMirror") as HTMLElement;
	const editor = () => (dom() as unknown as { editor: Editor }).editor;
	return { host, path, dom, editor };
}

it("opens the picker from the slash menu's request, and puts the chosen template in at the caret with the note's title filled in", async () => {
	const u = userEvent.setup();
	const { dom, editor } = await setup();
	act(() =>
		dom().dispatchEvent(new CustomEvent(TEMPLATE_EVENT, { bubbles: true })),
	);
	await u.click(await screen.findByText("/Work/Meeting"));
	await waitFor(() =>
		expect(editor().state.doc.textContent).toContain("Agenda"),
	);
	const doc = editor().getJSON().content ?? [];
	expect(doc.map((n) => n.type)).toEqual(["heading", "paragraph"]);
	expect(editor().state.doc.child(0).textContent).toBe("Alpha");
	expect(
		screen.queryByRole("dialog", { name: "Insert a template" }),
	).toBeNull();
});

it("inserts after what is already written, not over it", async () => {
	const u = userEvent.setup();
	const { dom, editor } = await setup();
	act(() => {
		editor().commands.setContent({
			type: "doc",
			content: [
				{ type: "paragraph", content: [{ type: "text", text: "Keep me" }] },
			],
		});
		editor().commands.setTextSelection(3);
	});
	act(() =>
		dom().dispatchEvent(new CustomEvent(TEMPLATE_EVENT, { bubbles: true })),
	);
	await u.click(await screen.findByText("/Work/Meeting"));
	await waitFor(() => expect(editor().state.doc.childCount).toBe(3));
	expect(editor().state.doc.child(0).textContent).toBe("Keep me");
	expect(editor().state.doc.child(1).textContent).toBe("Alpha");
});

it("closes the picker with Escape and inserts nothing", async () => {
	const u = userEvent.setup();
	const { dom, editor } = await setup();
	const before = editor().state.doc.textContent;
	act(() =>
		dom().dispatchEvent(new CustomEvent(TEMPLATE_EVENT, { bubbles: true })),
	);
	await screen.findByText("/Work/Meeting");
	await u.keyboard("{Escape}");
	expect(
		screen.queryByRole("dialog", { name: "Insert a template" }),
	).toBeNull();
	expect(editor().state.doc.textContent).toBe(before);
});

it("opens the template manager from the picker's gear", async () => {
	const u = userEvent.setup();
	const { dom } = await setup();
	onManage.mockClear();
	act(() =>
		dom().dispatchEvent(new CustomEvent(TEMPLATE_EVENT, { bubbles: true })),
	);
	await screen.findByText("/Work/Meeting");
	await u.click(screen.getByRole("button", { name: "Manage Meeting" }));
	expect(onManage).toHaveBeenCalledTimes(1);
	expect(
		screen.queryByRole("dialog", { name: "Insert a template" }),
	).toBeNull();
});

it("saves the note, as typed, as a template under a name you choose", async () => {
	const u = userEvent.setup();
	const { host, editor } = await setup();
	act(() => {
		editor().commands.insertContent("Notes about {{title}}");
	});
	await u.click(screen.getByRole("button", { name: "Note actions" }));
	await u.click(
		await screen.findByRole("menuitem", { name: "Save as template…" }),
	);
	const box = await screen.findByRole("textbox", { name: "Template name" });
	expect((box as HTMLInputElement).value).toBe("Alpha");
	await u.clear(box);
	await u.type(box, "Alpha starter");
	await u.click(screen.getByRole("button", { name: "Save" }));
	await screen.findByText(/Saved as the template "Alpha starter"/);
	const saved = (await listTemplates(host)).templates.find(
		(t) => t.name === "Alpha starter",
	);
	expect(saved?.preview).toBe("Notes about {{title}}");
	// The note itself is unchanged by this.
	expect(editor().state.doc.textContent).toBe("Notes about {{title}}");
});

it("asks before replacing a template with the same name, and keeps the old one", async () => {
	const u = userEvent.setup();
	const { host } = await setup();
	await u.click(screen.getByRole("button", { name: "Note actions" }));
	await u.click(
		await screen.findByRole("menuitem", { name: "Save as template…" }),
	);
	const box = await screen.findByRole("textbox", { name: "Template name" });
	await u.clear(box);
	await u.type(box, "meeting");
	await u.click(screen.getByRole("button", { name: "Save" }));
	// There is also a Meeting in Work, but names are per folder: this one is new.
	await screen.findByText(/Saved as the template "meeting"/);
	await u.click(screen.getByRole("button", { name: "Note actions" }));
	await u.click(
		await screen.findByRole("menuitem", { name: "Save as template…" }),
	);
	const again = await screen.findByRole("textbox", { name: "Template name" });
	await u.clear(again);
	await u.type(again, "Meeting");
	await u.click(screen.getByRole("button", { name: "Save" }));
	const ask = await screen.findByRole("alertdialog");
	expect(within(ask).getByText("Replace this template?")).toBeTruthy();
	await u.click(within(ask).getByRole("button", { name: "Replace" }));
	await screen.findByText(/Saved as the template "Meeting"/);
	const recovered = (await host.list(".vaultops/recovery")).map((e) => e.name);
	expect(recovered).toHaveLength(1);
});

it("keeps the picker off in the reading view, but still lets the note be saved as a template", async () => {
	const u = userEvent.setup();
	const { dom } = await setup({ reading: true });
	expect(dom().dataset.templates).toBe("off");
	await u.click(screen.getByRole("button", { name: "Note actions" }));
	expect(
		await screen.findByRole("menuitem", { name: "Save as template…" }),
	).toBeTruthy();
});

it("does not offer Save as template in a read-only vault", async () => {
	const u = userEvent.setup();
	await setup({ writable: false });
	await u.click(screen.getByRole("button", { name: "Note actions" }));
	await screen.findByRole("menuitem", { name: /Copy file path/ });
	expect(
		screen.queryByRole("menuitem", { name: "Save as template…" }),
	).toBeNull();
});
