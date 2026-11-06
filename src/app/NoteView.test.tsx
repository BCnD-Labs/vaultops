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
import { afterEach, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { createNote } from "../core/notes/repository";
import { openNote } from "../editor/note-io";
import { MemoryHost } from "../host/memory-host";
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
}: {
	host: MemoryHost;
	rows: NoteRow[];
	writable: boolean;
	onMoveToTrash: () => void;
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

async function setup(writable = true) {
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

it("each pane asks its own move-to-trash question", async () => {
	const { run, a, b, pane } = await setup();
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
	expect(
		within(pane("right")).getByText("Move this note to the trash?"),
	).toBeTruthy();
	expect(
		within(pane("left")).queryByText("Move this note to the trash?"),
	).toBeNull();
	await user.click(
		within(pane("right")).getByRole("button", { name: "Cancel" }),
	);
	expect(screen.queryByText("Move this note to the trash?")).toBeNull();
});

it("confirming asks the caller to trash the note and clears the question", async () => {
	const { run, a, onMoveToTrash } = await setup();
	await run(() => api.open(a));
	const user = userEvent.setup();
	await user.click(await screen.findByRole("button", { name: "Note actions" }));
	await user.click(
		await screen.findByRole("menuitem", { name: "Move to trash" }),
	);
	await user.click(screen.getByRole("button", { name: "Move to trash" }));
	expect(onMoveToTrash).toHaveBeenCalledTimes(1);
	expect(screen.queryByText("Move this note to the trash?")).toBeNull();
});

it("a note loaded into the pane starts with nothing to confirm", async () => {
	const { run, a, b } = await setup();
	await run(() => api.open(a));
	await run(() => api.open(b));
	const user = userEvent.setup();
	await user.click(await screen.findByRole("button", { name: "Note actions" }));
	await user.click(
		await screen.findByRole("menuitem", { name: "Move to trash" }),
	);
	expect(screen.getByText("Move this note to the trash?")).toBeTruthy();
	await user.click(screen.getByRole("tab", { name: "Alpha" }));
	await waitFor(() =>
		expect(
			(screen.getByRole("textbox", { name: "Title" }) as HTMLInputElement)
				.value,
		).toBe("Alpha"),
	);
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

it("reloading the same note in place also clears the questions", async () => {
	const { run, host, a } = await setup();
	await run(() => api.open(a));
	const user = userEvent.setup();
	await user.click(await screen.findByRole("button", { name: "Note actions" }));
	await user.click(
		await screen.findByRole("menuitem", { name: "Move to trash" }),
	);
	expect(screen.getByText("Move this note to the trash?")).toBeTruthy();
	// The pane stays ready the whole time (as after "load the disk version").
	const fresh = await openNote(host, a);
	act(() => api.panes.left.session.load(fresh, a));
	expect(screen.queryByText("Move this note to the trash?")).toBeNull();
	expect(screen.getByRole("textbox", { name: "Title" })).toBeTruthy();
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
