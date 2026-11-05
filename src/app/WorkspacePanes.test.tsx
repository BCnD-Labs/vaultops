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

// happy-dom has no real DataTransfer, and its drag events drop clientX.
function transfer() {
	const data = new Map<string, string>();
	return {
		get types() {
			return Array.from(data.keys());
		},
		setData: (type: string, value: string) => void data.set(type, value),
		getData: (type: string) => data.get(type) ?? "",
		effectAllowed: "",
		dropEffect: "",
	};
}

function dragTo(
	node: Element,
	type: "dragover" | "drop",
	dt: ReturnType<typeof transfer>,
	clientX = 0,
) {
	act(() => {
		fireEvent(
			node,
			Object.assign(new Event(type, { bubbles: true, cancelable: true }), {
				dataTransfer: dt,
				clientX,
			}),
		);
	});
}

/** Tabs 100px wide side by side, so a drop's x picks a place in the strip. */
function lay(strip: HTMLElement) {
	for (const [i, node] of strip.querySelectorAll(".tab").entries())
		node.getBoundingClientRect = () =>
			({ left: i * 100, width: 100 }) as DOMRect;
}

const order = (strip: { getAllByRole: (role: "tab") => HTMLElement[] }) =>
	strip.getAllByRole("tab").map((t) => t.textContent);

async function threeTabs() {
	const s = await setup();
	await s.run(() => api.open(s.a));
	await s.run(() => api.open(s.b));
	await s.run(() => api.open(s.board));
	await screen.findByRole("region", { name: "Canvas view" });
	return s;
}

it("dragging a tab within its strip reorders it", async () => {
	const { left } = await threeTabs();
	const strip = screen.getByRole("tablist", { name: "Open notes" });
	lay(strip);
	const dt = transfer();
	fireEvent.dragStart(
		left().getByRole("tab", { name: "Board" }).parentElement as HTMLElement,
		{ dataTransfer: dt },
	);
	dragTo(strip, "drop", dt, 10);
	await waitFor(() =>
		expect(order(left())).toEqual(["Board", "Alpha", "Beta"]),
	);
});

it("dropping a tab just after itself changes nothing", async () => {
	const { left } = await threeTabs();
	const strip = screen.getByRole("tablist", { name: "Open notes" });
	lay(strip);
	const dt = transfer();
	fireEvent.dragStart(
		left().getByRole("tab", { name: "Alpha" }).parentElement as HTMLElement,
		{ dataTransfer: dt },
	);
	// Between Alpha and Beta is where Alpha already is.
	dragTo(strip, "drop", dt, 120);
	await act(async () => {});
	expect(order(left())).toEqual(["Alpha", "Beta", "Board"]);
});

it("dragging a tab forward lands it before the tab it was dropped on", async () => {
	const { left } = await threeTabs();
	const strip = screen.getByRole("tablist", { name: "Open notes" });
	lay(strip);
	const dt = transfer();
	fireEvent.dragStart(
		left().getByRole("tab", { name: "Alpha" }).parentElement as HTMLElement,
		{ dataTransfer: dt },
	);
	// Before Board: Alpha's own slot closes up, so it lands second.
	dragTo(strip, "drop", dt, 220);
	await waitFor(() =>
		expect(order(left())).toEqual(["Beta", "Alpha", "Board"]),
	);
});

it("dragging onto the other pane's strip moves the tab there, at that place", async () => {
	const { run, b, left, right } = await threeTabs();
	await run(() => api.moveTab(b, "right"));
	const rightStrip = await screen.findByRole("tablist", {
		name: "Open notes, right side",
	});
	await run(() => api.open(b, "right"));
	lay(rightStrip);
	const dt = transfer();
	fireEvent.dragStart(
		left().getByRole("tab", { name: "Board" }).parentElement as HTMLElement,
		{ dataTransfer: dt },
	);
	dragTo(rightStrip, "drop", dt, 10);
	await waitFor(() => expect(order(right())).toEqual(["Board", "Beta"]));
	expect(order(left())).toEqual(["Alpha"]);
});

it("drop zones exist only while a tab is being dragged", async () => {
	const { run, b, left, right } = await threeTabs();
	await run(() => api.moveTab(b, "right"));
	await screen.findByRole("tablist", { name: "Open notes, right side" });
	expect(screen.queryByText("Move here")).toBeNull();
	const dt = transfer();
	const alpha = left().getByRole("tab", { name: "Alpha" })
		.parentElement as HTMLElement;
	fireEvent.dragStart(alpha, { dataTransfer: dt });
	// One zone, on the pane the tab did not come from.
	expect(screen.getAllByText("Move here")).toHaveLength(1);
	expect(right).toBeTruthy();
	fireEvent.dragEnd(alpha, { dataTransfer: dt });
	expect(screen.queryByText("Move here")).toBeNull();
});

it("dropping on the other pane's body moves the tab to its end", async () => {
	const { run, b, left, right } = await threeTabs();
	await run(() => api.moveTab(b, "right"));
	await screen.findByRole("tablist", { name: "Open notes, right side" });
	const dt = transfer();
	fireEvent.dragStart(
		left().getByRole("tab", { name: "Board" }).parentElement as HTMLElement,
		{ dataTransfer: dt },
	);
	dragTo(screen.getByText("Move here"), "drop", dt);
	await waitFor(() => expect(order(right())).toEqual(["Beta", "Board"]));
	expect(screen.queryByText("Move here")).toBeNull();
});

it("a single pane offers a right-edge zone that opens the tab beside", async () => {
	const { left } = await threeTabs();
	const dt = transfer();
	fireEvent.dragStart(
		left().getByRole("tab", { name: "Beta" }).parentElement as HTMLElement,
		{ dataTransfer: dt },
	);
	dragTo(screen.getByText("Drop to open beside"), "drop", dt);
	const right = await screen.findByRole("tablist", {
		name: "Open notes, right side",
	});
	expect(order(within(right))).toEqual(["Beta"]);
	expect(order(left())).toEqual(["Alpha", "Board"]);
});

it("a lone tab gets no edge zone, since it has nowhere to leave to", async () => {
	const { run, a, left } = await setup();
	await run(() => api.open(a));
	await screen.findByRole("heading", { name: "Alpha" });
	fireEvent.dragStart(
		left().getByRole("tab", { name: "Alpha" }).parentElement as HTMLElement,
		{ dataTransfer: transfer() },
	);
	expect(screen.queryByText("Drop to open beside")).toBeNull();
});

it("a drag that is not a tab shows no zones and moves nothing", async () => {
	const { left } = await threeTabs();
	const strip = screen.getByRole("tablist", { name: "Open notes" });
	lay(strip);
	const dt = transfer();
	dt.setData("application/x-vaultops-block", "{}");
	dragTo(strip, "drop", dt, 10);
	expect(order(left())).toEqual(["Alpha", "Beta", "Board"]);
	expect(screen.queryByText("Drop to open beside")).toBeNull();
});

it("Alt+Shift+Arrow reorders a tab, and the tab keeps keyboard focus", async () => {
	const { left } = await threeTabs();
	const board = left().getByRole("tab", { name: "Board" });
	board.focus();
	fireEvent.keyDown(board, { key: "ArrowLeft", altKey: true, shiftKey: true });
	await waitFor(() =>
		expect(order(left())).toEqual(["Alpha", "Board", "Beta"]),
	);
	await waitFor(() =>
		expect(document.activeElement).toBe(
			left().getByRole("tab", { name: "Board" }),
		),
	);
});

it("Alt+Shift+Arrow at a strip's end crosses to the other pane, and back", async () => {
	const { run, b, left, right } = await threeTabs();
	await run(() => api.moveTab(b, "right"));
	await screen.findByRole("tablist", { name: "Open notes, right side" });
	const board = left().getByRole("tab", { name: "Board" });
	fireEvent.keyDown(board, { key: "ArrowRight", altKey: true, shiftKey: true });
	await waitFor(() => expect(order(right())).toEqual(["Board", "Beta"]));
	await waitFor(() =>
		expect(document.activeElement).toBe(
			right().getByRole("tab", { name: "Board" }),
		),
	);
	fireEvent.keyDown(right().getByRole("tab", { name: "Board" }), {
		key: "ArrowLeft",
		altKey: true,
		shiftKey: true,
	});
	await waitFor(() => expect(order(left())).toEqual(["Alpha", "Board"]));
	expect(order(right())).toEqual(["Beta"]);
});

it("Alt+Shift+Arrow does nothing at the edge of a single pane's only tab", async () => {
	const { run, a, left } = await setup();
	await run(() => api.open(a));
	await screen.findByRole("heading", { name: "Alpha" });
	fireEvent.keyDown(left().getByRole("tab", { name: "Alpha" }), {
		key: "ArrowRight",
		altKey: true,
		shiftKey: true,
	});
	expect(
		screen.queryByRole("tablist", { name: "Open notes, right side" }),
	).toBeNull();
});
