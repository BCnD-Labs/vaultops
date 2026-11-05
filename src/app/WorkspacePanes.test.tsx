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
import { afterEach, expect, it } from "vitest";
import { createCanvas, createNote } from "../core/notes/repository";
import { MemoryHost } from "../host/memory-host";
import { loadVault, type NoteRow } from "./session";
import { useWorkspaceHost, type WorkspaceHost } from "./useWorkspaceHost";
import { WorkspacePanes } from "./WorkspacePanes";

afterEach(cleanup);

let api: WorkspaceHost;

function Harness({
	host,
	rows,
	board,
}: {
	host: MemoryHost;
	rows: NoteRow[];
	board: string;
}) {
	api = useWorkspaceHost({
		host,
		writable: true,
		isCanvas: (path) => path === board,
		onSaved: () => {},
		onUnsaved: () => {},
		onError: () => {},
	});
	return (
		<WorkspacePanes
			host={api}
			notes={rows}
			renderNote={(pane) => (
				<main className="pane">
					<h2>{pane.session.title}</h2>
				</main>
			)}
			renderCanvas={(path) => (
				<section aria-label="Canvas view">{path}</section>
			)}
			renderEmpty={(pane) => <p>Empty {pane.id}</p>}
		/>
	);
}

async function setup() {
	const host = new MemoryHost();
	await loadVault(host);
	const a = (await createNote(host, "", "Alpha")).path;
	const b = (await createNote(host, "", "Beta")).path;
	const board = (await createCanvas(host, "", "Board")).path;
	const rows = (await loadVault(host)).notes;
	const view = render(<Harness host={host} rows={rows} board={board} />);
	const run = (command: () => Promise<boolean>) =>
		act(async () => {
			expect(await command()).toBe(true);
		});
	const left = () =>
		within(screen.getByRole("tablist", { name: "Open notes" }));
	const right = () =>
		within(screen.getByRole("tablist", { name: "Open notes, right side" }));
	const menu = async (tab: HTMLElement, item: string) => {
		fireEvent.contextMenu(tab.parentElement as HTMLElement);
		await userEvent
			.setup()
			.click(await screen.findByRole("menuitem", { name: item }));
	};
	return { host, a, b, board, view, run, left, right, menu };
}

it("a single pane has one tab strip and shows the open note", async () => {
	const { run, a, left } = await setup();
	expect(screen.getByText("Empty left")).toBeTruthy();
	await run(() => api.open(a));
	await screen.findByRole("heading", { name: "Alpha" });
	expect(
		left().getByRole("tab", { name: "Alpha" }).getAttribute("aria-selected"),
	).toBe("true");
	expect(
		screen.queryByRole("tablist", { name: "Open notes, right side" }),
	).toBeNull();
});

it("picking a tab shows that note", async () => {
	const { run, a, b, left } = await setup();
	await run(() => api.open(a));
	await run(() => api.open(b));
	await screen.findByRole("heading", { name: "Beta" });
	await userEvent.setup().click(left().getByRole("tab", { name: "Alpha" }));
	await screen.findByRole("heading", { name: "Alpha" });
});

it("Split view gives the right side its own strip and note", async () => {
	const { run, a, b, left, right, menu } = await setup();
	await run(() => api.open(a));
	await run(() => api.open(b));
	await menu(left().getByRole("tab", { name: "Alpha" }), "Split view");
	await waitFor(() =>
		expect(right().getByRole("tab", { name: "Alpha" })).toBeTruthy(),
	);
	expect(left().queryByRole("tab", { name: "Alpha" })).toBeNull();
	expect(left().getByRole("tab", { name: "Beta" })).toBeTruthy();
	// Both notes are live at once.
	await screen.findByRole("heading", { name: "Alpha" });
	await screen.findByRole("heading", { name: "Beta" });
});

it("Move to other side carries a tab across, and back closes the split", async () => {
	const { run, a, b, left, right, menu } = await setup();
	await run(() => api.open(a));
	await run(() => api.open(b));
	await menu(left().getByRole("tab", { name: "Beta" }), "Move to right side");
	await waitFor(() =>
		expect(right().getByRole("tab", { name: "Beta" })).toBeTruthy(),
	);
	await menu(right().getByRole("tab", { name: "Beta" }), "Move to left side");
	await waitFor(() =>
		expect(
			screen.queryByRole("tablist", { name: "Open notes, right side" }),
		).toBeNull(),
	);
	expect(
		left()
			.getAllByRole("tab")
			.map((t) => t.textContent),
	).toEqual(["Alpha", "Beta"]);
});

it("a lone tab can't be moved out of a single pane", async () => {
	const { run, a, left } = await setup();
	await run(() => api.open(a));
	await screen.findByRole("heading", { name: "Alpha" });
	fireEvent.contextMenu(
		left().getByRole("tab", { name: "Alpha" }).parentElement as HTMLElement,
	);
	await screen.findByRole("menuitem", { name: "Split view" });
	expect(
		screen.queryByRole("menuitem", { name: "Move to right side" }),
	).toBeNull();
});

it("closing a pane's empty tab leaves the other pane's empty tab alone", async () => {
	const { run, a, b, left, right } = await setup();
	await run(() => api.open(a));
	await run(() => api.open(b));
	await run(() => api.moveTab(b, "right"));
	await run(() => api.newTab("left"));
	await run(() => api.newTab("right"));
	await right().findByRole("tab", { name: "New tab" });
	await userEvent
		.setup()
		.click(right().getByRole("button", { name: "Close New tab" }));
	await waitFor(() =>
		expect(right().queryByRole("tab", { name: "New tab" })).toBeNull(),
	);
	expect(left().getByRole("tab", { name: "New tab" })).toBeTruthy();
});

it("clicking a pane focuses it, and the split marks which one", async () => {
	const { run, a, b, view } = await setup();
	await run(() => api.open(a));
	await run(() => api.open(b));
	await run(() => api.moveTab(b, "right"));
	const pane = (id: string) =>
		view.container.querySelector(`[data-pane-id="${id}"]`) as HTMLElement;
	await waitFor(() => expect(pane("right").dataset.focused).toBe("true"));
	fireEvent.pointerDown(await screen.findByRole("heading", { name: "Alpha" }));
	await waitFor(() => expect(pane("left").dataset.focused).toBe("true"));
	expect(pane("right").dataset.focused).toBe("false");
	expect(api.focused).toBe("left");
});

it("a canvas and the empty tab use their own renderers", async () => {
	const { run, board } = await setup();
	await run(() => api.open(board));
	expect(
		await screen.findByRole("region", { name: "Canvas view" }),
	).toBeTruthy();
	await run(() => api.newTab());
	expect(await screen.findByText("Empty left")).toBeTruthy();
});

it("shows a placeholder while a note is being read in, then the note", async () => {
	const { run, a, host } = await setup();
	let release = () => {};
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	const read = host.readText.bind(host);
	host.readText = async (path: string) => {
		if (path === a) await gate;
		return read(path);
	};
	await run(() => api.open(a));
	expect(await screen.findByRole("status")).toBeTruthy();
	expect(screen.getByText("Opening the note…")).toBeTruthy();
	expect(screen.queryByRole("heading", { name: "Alpha" })).toBeNull();
	await act(async () => release());
	await screen.findByRole("heading", { name: "Alpha" });
});
