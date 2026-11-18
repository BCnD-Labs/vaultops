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
import { closeHistory } from "@tiptap/pm/history";
import { afterEach, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { parseNote } from "../core/note-format";
import { headerIcon } from "../core/notes/icon";
import { createNote } from "../core/notes/repository";
import { MemoryHost } from "../host/memory-host";
import { CanvasEmbed } from "./CanvasEmbed";
import { SessionNoteView } from "./NoteView";
import { loadVault, type NoteRow } from "./session";
import { useWorkspaceHost, type WorkspaceHost } from "./useWorkspaceHost";
import { WorkspacePanes } from "./WorkspacePanes";

afterEach(() => {
	cleanup();
	reading = false;
});

let api: WorkspaceHost;
let reading = false;
const onToggleReading = vi.fn();

function Harness({
	host,
	rows,
	writable,
	onMoveToTrash,
	embed,
}: {
	host: MemoryHost;
	rows: NoteRow[];
	writable: boolean;
	onMoveToTrash: () => void;
	embed: boolean;
}) {
	api = useWorkspaceHost({
		host,
		writable,
		isCanvas: () => false,
		onSaved: () => {},
		onUnsaved: () => {},
		onError: () => {},
	});
	const first = rows[0];
	return (
		<TooltipProvider>
			{embed && first && (
				<div className="react-flow__node selected" data-testid="selected-embed">
					<CanvasEmbed
						host={host}
						documents={api.documents}
						target={{ status: "found", row: first }}
					/>
				</div>
			)}
			<WorkspacePanes
				host={api}
				notes={rows}
				renderNote={(pane) => (
					<SessionNoteView
						session={pane.session}
						writable={writable}
						reading={reading}
						onToggleReading={onToggleReading}
						onLoadDisk={() => {}}
						onSaveCopy={() => {}}
						onMoveToTrash={onMoveToTrash}
					/>
				)}
				renderCanvas={() => null}
				renderEmpty={() => <p>Empty</p>}
			/>
		</TooltipProvider>
	);
}

async function setup(writable = true, embed = false) {
	const host = new MemoryHost();
	await loadVault(host);
	const a = (await createNote(host, "", "Alpha")).path;
	const b = (await createNote(host, "", "Beta")).path;
	const rows = (await loadVault(host)).notes;
	const onMoveToTrash = vi.fn();
	render(
		<Harness
			host={host}
			rows={rows}
			writable={writable}
			onMoveToTrash={onMoveToTrash}
			embed={embed}
		/>,
	);
	const run = (command: () => Promise<boolean>) =>
		act(async () => {
			expect(await command()).toBe(true);
		});
	const pane = (id: "left" | "right") =>
		document.querySelector(`[data-pane-id="${id}"]`) as HTMLElement;
	const titles = () =>
		screen.getAllByRole("textbox", { name: "Title" }) as HTMLInputElement[];
	return { host, a, b, run, pane, titles, onMoveToTrash };
}

it("transfers the same editor and history both ways after composition during a save", async () => {
	const { host, run, a, pane, titles } = await setup(true, true);
	await run(() => api.open(a));
	const embed = screen.getByLabelText("Embedded note");
	const soleEditorIn = (surface: HTMLElement) => {
		const editors = document.querySelectorAll<HTMLElement & { editor: Editor }>(
			'.ProseMirror[contenteditable="true"]',
		);
		expect(editors).toHaveLength(1);
		const field = editors[0];
		if (!field) throw new Error("Expected a mounted editor.");
		expect(surface.contains(field)).toBe(true);
		return field;
	};
	const field = await waitFor(() => soleEditorIn(pane("left")));
	const { editor } = field;
	const type = (text: string) =>
		act(() =>
			editor.view.dispatch(closeHistory(editor.state.tr).insertText(text)),
		);
	const write = host.writeTextAtomic.bind(host);
	let release = () => {};
	const held = new Promise<void>((resolve) => {
		release = resolve;
	});
	vi.spyOn(host, "writeTextAtomic").mockImplementation(async (path, text) => {
		if (path === a) await held;
		await write(path, text);
	});
	type("pane ");
	const saving = api.flushAll();
	try {
		await waitFor(() =>
			expect(host.writeTextAtomic).toHaveBeenCalledWith(a, expect.any(String)),
		);
		fireEvent.compositionStart(field);
		await act(async () => {
			fireEvent.doubleClick(embed);
		});
		expect(soleEditorIn(pane("left"))).toBe(field);
		type("日本語");
		act(() => {
			editor.commands.setTextSelection({ from: 1, to: 3 });
		});
		const selection = editor.state.selection.toJSON();
		fireEvent.compositionEnd(field);
		expect(await waitFor(() => soleEditorIn(embed))).toBe(field);
		expect(editor.state.selection.toJSON()).toEqual(selection);
		expect(titles()[0]?.readOnly).toBe(true);
		act(() => {
			expect(editor.commands.undo()).toBe(true);
		});
		type("embed ");
		const preview = screen.getByLabelText("Note preview");
		expect(preview.textContent).toContain("pane embed");
		fireEvent.compositionStart(field);
		fireEvent.pointerDown(preview);
		expect(soleEditorIn(embed)).toBe(field);
		type("かな");
		const returning = editor.state.selection.toJSON();
		fireEvent.compositionEnd(field);
		expect(await waitFor(() => soleEditorIn(pane("left")))).toBe(field);
		expect(editor.state.selection.toJSON()).toEqual(returning);
		expect(document.activeElement).toBe(field);
		act(() => {
			expect(editor.commands.undo()).toBe(true);
		});
		expect(editor.getText()).toBe("pane embed ");
		type("final");
	} finally {
		release();
		await act(async () => {
			expect(await saving).toBe(true);
		});
	}
	expect(await host.readText(a)).toContain("pane embed final");
	fireEvent.keyDown(screen.getByTestId("selected-embed"), { key: "Enter" });
	expect(await waitFor(() => soleEditorIn(embed))).toBe(field);
	fireEvent.keyDown(field, { key: "Escape" });
	expect(await waitFor(() => soleEditorIn(pane("left")))).toBe(field);
});

it("shows one note's title, status line and editor", async () => {
	const { run, a, pane } = await setup();
	await run(() => api.open(a));
	const title = (await screen.findByRole("textbox", {
		name: "Title",
	})) as HTMLInputElement;
	expect(title.value).toBe("Alpha");
	expect(title.readOnly).toBe(false);
	expect(
		within(pane("left")).getByRole("button", { name: "Note actions" }),
	).toBeTruthy();
});

it("two panes hold two live notes, and a title edit in one leaves the other alone", async () => {
	const { run, host, a, b, titles } = await setup();
	await run(() => api.open(a));
	await run(() => api.open(b));
	await run(() => api.moveTab(b, "right"));
	await waitFor(() =>
		expect(titles().map((t) => t.value)).toEqual(["Alpha", "Beta"]),
	);
	const [, rightTitle] = titles() as [HTMLInputElement, HTMLInputElement];
	fireEvent.change(rightTitle, { target: { value: "Beta two" } });
	await act(async () => {
		expect(await api.flushAll()).toBe(true);
	});
	expect(await host.kindOf("Beta two.vnote")).toBe("file");
	expect(await host.kindOf("Alpha.vnote")).toBe("file");
	await waitFor(() =>
		expect(titles().map((t) => t.value)).toEqual(["Alpha", "Beta two"]),
	);
	// The right strip's tab followed the rename.
	expect(
		within(
			screen.getByRole("tablist", { name: "Open notes, right side" }),
		).getByRole("tab", { name: "Beta two" }),
	).toBeTruthy();
});

it("Move to trash in a pane's menu asks the caller at once, with no question first", async () => {
	const { run, a, b, pane, onMoveToTrash } = await setup();
	await run(() => api.open(a));
	await run(() => api.open(b));
	await run(() => api.moveTab(b, "right"));
	await waitFor(() =>
		expect(screen.getAllByRole("textbox", { name: "Title" })).toHaveLength(2),
	);
	const user = userEvent.setup();
	await user.click(
		within(pane("right")).getByRole("button", { name: "Note actions" }),
	);
	await user.click(
		await screen.findByRole("menuitem", { name: "Move to trash" }),
	);
	expect(onMoveToTrash).toHaveBeenCalledTimes(1);
	expect(screen.queryByText("Move this note to the trash?")).toBeNull();
});

it("a read-only vault shows the note locked, with no way to trash it", async () => {
	const { run, a } = await setup(false);
	await run(() => api.open(a));
	const title = (await screen.findByRole("textbox", {
		name: "Title",
	})) as HTMLInputElement;
	expect(title.readOnly).toBe(true);
	await userEvent
		.setup()
		.click(screen.getByRole("button", { name: "Note actions" }));
	expect(
		await screen.findByRole("menuitem", { name: "Copy file path" }),
	).toBeTruthy();
	expect(screen.queryByRole("menuitem", { name: "Move to trash" })).toBeNull();
});

it("reading view locks the title and the editor and keeps the text", async () => {
	reading = true;
	const { run, a } = await setup();
	await run(() => api.open(a));
	const title = (await screen.findByRole("textbox", {
		name: "Title",
	})) as HTMLInputElement;
	expect(title.readOnly).toBe(true);
	await waitFor(() =>
		expect(
			document.querySelector('.ProseMirror[contenteditable="false"]'),
		).not.toBeNull(),
	);
	expect(
		document.querySelector('.ProseMirror[contenteditable="true"]'),
	).toBeNull();
});

it("the note menu holds reading view and the file path, beside move to trash", async () => {
	const { run, a } = await setup();
	await run(() => api.open(a));
	const user = userEvent.setup();
	await user.click(await screen.findByRole("button", { name: "Note actions" }));
	for (const name of [
		"Switch to reading view",
		"Copy file path",
		"Move to trash",
	])
		expect(await screen.findByRole("menuitem", { name })).toBeTruthy();
	await user.click(
		screen.getByRole("menuitem", { name: "Switch to reading view" }),
	);
	expect(onToggleReading).toHaveBeenCalledTimes(1);
});

it("keeps a reading view button just before the note menu", async () => {
	const { run, a } = await setup();
	await run(() => api.open(a));
	const user = userEvent.setup();
	const button = await screen.findByRole("button", {
		name: "Switch to reading view",
	});
	const menu = screen.getByRole("button", { name: "Note actions" });
	expect(
		button.compareDocumentPosition(menu) & Node.DOCUMENT_POSITION_FOLLOWING,
	).toBeTruthy();
	onToggleReading.mockClear();
	await user.click(button);
	expect(onToggleReading).toHaveBeenCalledTimes(1);
});

it("Enter in the title moves the cursor into the note body", async () => {
	const { run, a } = await setup();
	await run(() => api.open(a));
	const title = (await screen.findByRole("textbox", {
		name: "Title",
	})) as HTMLInputElement;
	const body = await waitFor(() => {
		const field = document.querySelector<HTMLElement>(
			'.note-editor [contenteditable="true"]',
		);
		expect(field).not.toBeNull();
		return field as HTMLElement;
	});
	title.focus();
	fireEvent.keyDown(title, { key: "Enter" });
	expect(document.activeElement).toBe(body);
});

it("adds and removes a title icon through the picker and saves both changes", async () => {
	const { run, host, a } = await setup();
	await run(() => api.open(a));

	fireEvent.click(screen.getByRole("button", { name: "Add icon" }));
	fireEvent.click(await screen.findByRole("button", { name: "Icon star" }));
	await run(() => api.flushAll());
	expect(headerIcon(parseNote(await host.readText(a)).note?.header)).toBe(
		"star",
	);
	expect(
		screen.getByRole("tab", { name: "Alpha" }).querySelector(".tab-icon"),
	).toBeTruthy();

	fireEvent.click(screen.getByRole("button", { name: "Change icon" }));
	fireEvent.click(await screen.findByRole("button", { name: "Remove icon" }));
	await run(() => api.flushAll());
	expect(parseNote(await host.readText(a)).note?.header).not.toHaveProperty(
		"icon",
	);
	expect(screen.getByRole("button", { name: "Add icon" })).toBeTruthy();
});

it("imports a cover and removes its header without deleting the image", async () => {
	const { run, host, a } = await setup();
	await run(() => api.open(a));
	host.nextCover = { name: "photo.png", bytes: new Uint8Array([1, 2]) };

	fireEvent.click(screen.getByRole("button", { name: "Add cover" }));
	const remove = await screen.findByRole("button", { name: "Remove cover" });
	await run(() => api.flushAll());
	const path = "attachments/photo.png";
	expect(parseNote(await host.readText(a)).note?.header.cover).toBe(path);
	const image = await waitFor(() => {
		const img = document.querySelector(".note-cover img");
		expect(img?.getAttribute("src")).toMatch(/^blob:/);
		return img as HTMLImageElement;
	});
	fireEvent.load(image);
	expect(image.dataset.loaded).toBe("true");
	fireEvent.error(image);
	expect(screen.getByText("Cover unavailable")).toBeTruthy();

	fireEvent.click(remove);
	await run(() => api.flushAll());
	expect(parseNote(await host.readText(a)).note?.header).not.toHaveProperty(
		"cover",
	);
	expect(new Uint8Array(await host.readCover(path))).toEqual(
		new Uint8Array([1, 2]),
	);
	expect(screen.queryByRole("button", { name: "Remove cover" })).toBeNull();
});
