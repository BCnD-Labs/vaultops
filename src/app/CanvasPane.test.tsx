// @vitest-environment happy-dom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { DragEvent } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { canvasFlowProps } from "@/components/ui/canvas";
import { parseNote, serializeNote } from "../core/note-format";
import { attrsOf } from "../core/notes/canvas-ops";
import { createCanvas } from "../core/notes/repository";
import { BLOCK_DRAG_TYPE } from "../editor/block-drag";
import { MemoryHost } from "../host/memory-host";
import { CanvasPane } from "./CanvasPane";

/** The id of the canvas under test, for a card dropped back where it came from. */
let ownCanvasId = "";
/** What the mocked surface reports as selected, and the boxes it says they fill. */
let mockSelection: string[] = [];
let mockBoxes: {
	[id: string]: { x: number; y: number; w: number; h: number };
} = {};

vi.mock("@/components/ui/canvas", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("@/components/ui/canvas")>();
	return {
		...actual,
		Canvas: ({
			nodes,
			locked = false,
			snapObjects = false,
			selectionToolbar,
			onMove,
			onDropBlock,
		}: {
			snapObjects?: boolean;
			selectionToolbar?: (context: {
				ids: string[];
				bounds: () => null;
				boxes: () => typeof mockBoxes;
				allBoxes: () => typeof mockBoxes;
			}) => React.ReactNode;
			nodes: {
				id: string;
				draggable?: boolean;
				position: { x: number; y: number };
				data: { label: React.ReactNode };
			}[];
			locked?: boolean;
			onMove: (id: string, position: { x: number; y: number }) => void;
			onDropBlock: (
				event: DragEvent,
				position: { x: number; y: number },
			) => void;
		}) => (
			<div
				data-testid="mock-canvas"
				data-snap-objects={String(snapObjects)}
				data-flow-props={JSON.stringify(actual.canvasFlowProps(locked))}
			>
				<button
					type="button"
					onClick={() => {
						const dataTransfer = new DataTransfer();
						dataTransfer.setData(
							BLOCK_DRAG_TYPE,
							JSON.stringify({ noteId: "source", blockId: "block" }),
						);
						onDropBlock({ dataTransfer } as DragEvent, { x: 14, y: 28 });
					}}
				>
					Drop VaultOps block
				</button>
				<button
					type="button"
					onClick={() => {
						const dataTransfer = new DataTransfer();
						dataTransfer.setData(
							BLOCK_DRAG_TYPE,
							JSON.stringify({ noteId: ownCanvasId, blockId: "block" }),
						);
						onDropBlock({ dataTransfer } as DragEvent, { x: 3, y: 4 });
					}}
				>
					Drop own card
				</button>
				<button
					type="button"
					onClick={() =>
						onDropBlock({ dataTransfer: new DataTransfer() } as DragEvent, {
							x: 0,
							y: 0,
						})
					}
				>
					Drop other data
				</button>
				{mockSelection.length > 0 &&
					selectionToolbar?.({
						ids: mockSelection,
						bounds: () => null,
						boxes: () => mockBoxes,
						allBoxes: () => mockBoxes,
					})}
				{nodes.map((node) => (
					<div
						key={node.id}
						data-testid={`flow-node-${node.id}`}
						data-node-draggable={String(node.draggable)}
					>
						<span>{`${node.position.x},${node.position.y}`}</span>
						{node.data.label}
						<button
							type="button"
							onClick={() => onMove(node.id, { x: 88, y: 99 })}
						>
							Drag card
						</button>
					</div>
				))}
			</div>
		),
	};
});

afterEach(() => {
	cleanup();
	localStorage.clear();
	mockSelection = [];
	mockBoxes = {};
});

it("shows the empty canvas, then saves and reloads a dragged card", async () => {
	const host = new MemoryHost();
	const made = await createCanvas(host, "", "Board");
	const props = {
		host,
		path: made.path,
		canvases: [
			{
				path: made.path,
				title: "Board",
				preview: "",
				readOnly: false,
				kind: "canvas" as const,
				tags: [],
			},
		],
		writable: true,
		onSelect: vi.fn(),
		onDropBlock: vi.fn(),
	};
	const first = render(<CanvasPane {...props} />);
	expect(
		await screen.findByText("Drag a block here from a note."),
	).toBeTruthy();
	first.unmount();
	const note = parseNote(await host.readText(made.path)).note;
	if (!note) throw new Error("missing canvas");
	note.blocks = [
		{
			id: "a",
			type: "paragraph",
			parent: null,
			attrs: { x: 12, y: 30 },
			content: [{ type: "text", text: "Card" }],
		},
	];
	await host.writeTextAtomic(made.path, serializeNote(note));
	const second = render(<CanvasPane {...props} />);
	expect(await screen.findByText("12,30")).toBeTruthy();
	fireEvent.click(screen.getByRole("button", { name: "Drag card" }));
	await waitFor(() => expect(screen.getByText("88,99")).toBeTruthy());
	second.unmount();
	render(<CanvasPane {...props} />);
	expect(await screen.findByText("88,99")).toBeTruthy();
});

it("accepts a VaultOps block and explains invalid or read-only drops", async () => {
	const host = new MemoryHost();
	const made = await createCanvas(host, "", "Board");
	const onDropBlock = vi.fn().mockResolvedValue(undefined);
	const props = {
		host,
		path: made.path,
		canvases: [
			{
				path: made.path,
				title: "Board",
				preview: "",
				readOnly: false,
				kind: "canvas" as const,
				tags: [],
			},
		],
		writable: true,
		onSelect: vi.fn(),
		onDropBlock,
	};
	const first = render(<CanvasPane {...props} />);
	await screen.findByText("Drag a block here from a note.");
	fireEvent.click(screen.getByRole("button", { name: "Drop other data" }));
	expect((await screen.findByRole("alert")).textContent).toContain(
		"Only a VaultOps block",
	);
	fireEvent.click(screen.getByRole("button", { name: "Drop VaultOps block" }));
	await waitFor(() =>
		expect(onDropBlock).toHaveBeenCalledWith("block", "source", {
			x: 14,
			y: 28,
		}),
	);
	first.unmount();
	render(<CanvasPane {...props} writable={false} />);
	await screen.findByText("Drag a block here from a note.");
	fireEvent.click(screen.getByRole("button", { name: "Drop VaultOps block" }));
	expect((await screen.findByRole("alert")).textContent).toContain("read-only");
	expect(onDropBlock).toHaveBeenCalledTimes(1);
});

it("ignores a card dropped back on its own canvas", async () => {
	const host = new MemoryHost();
	const made = await createCanvas(host, "", "Board");
	ownCanvasId =
		parseNote(await host.readText(made.path)).note?.header.noteId ?? "";
	expect(ownCanvasId).not.toBe("");
	const onDropBlock = vi.fn().mockResolvedValue(undefined);
	render(
		<CanvasPane
			host={host}
			path={made.path}
			canvases={[
				{
					path: made.path,
					title: "Board",
					preview: "",
					readOnly: false,
					kind: "canvas" as const,
					tags: [],
				},
			]}
			writable={true}
			onSelect={vi.fn()}
			onDropBlock={onDropBlock}
		/>,
	);
	await screen.findByText("Drag a block here from a note.");
	fireEvent.click(screen.getByRole("button", { name: "Drop own card" }));
	await new Promise((resolve) => setTimeout(resolve, 20));
	expect(onDropBlock).not.toHaveBeenCalled();
	expect(screen.queryByRole("alert")).toBeNull();
});

it("toggles canvas lock, remembers the state, disables flow pan/zoom/drag while keeping native card drag and Move to open note", async () => {
	const user = userEvent.setup();
	const host = new MemoryHost();
	const made = await createCanvas(host, "", "Board");
	const note = parseNote(await host.readText(made.path)).note;
	if (!note) throw new Error("missing canvas");
	note.blocks = [
		{
			id: "a",
			type: "paragraph",
			parent: null,
			attrs: { x: 12, y: 30 },
			content: [{ type: "text", text: "Card" }],
		},
	];
	await host.writeTextAtomic(made.path, serializeNote(note));
	const onMoveToNote = vi.fn().mockResolvedValue(undefined);
	const props = {
		host,
		path: made.path,
		canvases: [
			{
				path: made.path,
				title: "Board",
				preview: "",
				readOnly: false,
				kind: "canvas" as const,
				tags: [],
			},
		],
		writable: true,
		onSelect: vi.fn(),
		onDropBlock: vi.fn(),
		onMoveToNote,
	};

	const first = render(<CanvasPane {...props} />);
	expect(await screen.findByText("Card")).toBeTruthy();

	const pane = screen.getByRole("region", { name: "Canvas view" });
	const lockButton = screen.getByRole("button", {
		name: "Lock canvas: drag cards out to the note",
	});
	const flowNode = screen.getByTestId("flow-node-a");
	const card = flowNode.querySelector(".canvas-card") as HTMLElement;

	// Default unlocked: flow pan, zoom, auto-pan and node drag are on.
	expect(lockButton.getAttribute("aria-pressed")).toBe("false");
	expect(pane.classList.contains("canvas-pane-locked")).toBe(false);
	expect(flowNode.getAttribute("data-node-draggable")).toBe("true");
	expect(card.getAttribute("draggable")).toBe("true");
	expect(
		JSON.parse(
			screen.getByTestId("mock-canvas").getAttribute("data-flow-props") ?? "{}",
		),
	).toEqual(canvasFlowProps(false));

	// Lock the canvas: border class, aria-pressed and storage flip; flow movement is off while native card drag stays true.
	fireEvent.click(lockButton);
	expect(lockButton.getAttribute("aria-pressed")).toBe("true");
	expect(pane.classList.contains("canvas-pane-locked")).toBe(true);
	expect(localStorage.getItem("vaultops:canvas-locked")).toBe("true");
	expect(flowNode.getAttribute("data-node-draggable")).toBe("false");
	expect(card.getAttribute("draggable")).toBe("true");
	const transfer = new DataTransfer();
	fireEvent.dragStart(card, { dataTransfer: transfer });
	expect(JSON.parse(transfer.getData(BLOCK_DRAG_TYPE))).toMatchObject({
		blockId: "a",
	});
	expect(
		JSON.parse(
			screen.getByTestId("mock-canvas").getAttribute("data-flow-props") ?? "{}",
		),
	).toEqual({
		nodesDraggable: false,
		panOnDrag: false,
		panOnScroll: false,
		zoomOnScroll: false,
		zoomOnPinch: false,
		zoomOnDoubleClick: false,
		autoPanOnNodeDrag: false,
	});

	// Card menu "Move to open note" still works while locked.
	await user.click(screen.getByRole("button", { name: "Card actions" }));
	await user.click(
		await screen.findByRole("menuitem", { name: "Move to open note" }),
	);
	expect(onMoveToNote).toHaveBeenCalledWith("a");

	// Remounting restores the remembered locked state.
	first.unmount();
	const second = render(<CanvasPane {...props} />);
	expect(await screen.findByText("Card")).toBeTruthy();
	const restoredButton = screen.getByRole("button", {
		name: "Lock canvas: drag cards out to the note",
	});
	expect(restoredButton.getAttribute("aria-pressed")).toBe("true");
	expect(
		screen
			.getByRole("region", { name: "Canvas view" })
			.classList.contains("canvas-pane-locked"),
	).toBe(true);

	// Unlocking restores all unlocked values.
	fireEvent.click(restoredButton);
	expect(restoredButton.getAttribute("aria-pressed")).toBe("false");
	expect(localStorage.getItem("vaultops:canvas-locked")).toBe("false");
	expect(
		screen.getByTestId("flow-node-a").getAttribute("data-node-draggable"),
	).toBe("true");
	expect(
		JSON.parse(
			screen.getByTestId("mock-canvas").getAttribute("data-flow-props") ?? "{}",
		),
	).toEqual(canvasFlowProps(false));
	second.unmount();

	// Storage failing is handled gracefully.
	vi.stubGlobal("localStorage", {
		getItem: () => {
			throw new Error("blocked");
		},
		setItem: () => {
			throw new Error("blocked");
		},
		clear: () => {},
	});
	render(<CanvasPane {...props} />);
	const fallbackButton = screen.getByRole("button", {
		name: "Lock canvas: drag cards out to the note",
	});
	expect(fallbackButton.getAttribute("aria-pressed")).toBe("false");
	expect(() => fireEvent.click(fallbackButton)).not.toThrow();
	expect(fallbackButton.getAttribute("aria-pressed")).toBe("true");
	vi.unstubAllGlobals();
});

it("names and renames a canvas, handles clashes and failures, and disables read-only canvases", async () => {
	const host = new MemoryHost();
	const made = await createCanvas(host);
	await createCanvas(host, "", "Taken");
	const onSelect = vi.fn();
	const onRename = vi.fn();
	const row = (path: string, title: string, readOnly = false) => ({
		path,
		title,
		preview: "",
		readOnly,
		kind: "canvas" as const,
		tags: [],
	});
	const baseProps = {
		host,
		path: made.path,
		canvases: [row("Taken.vnote", "Taken"), row(made.path, "Untitled canvas")],
		writable: true,
		focusName: true,
		onSelect,
		onRename,
		onDropBlock: vi.fn(),
	};

	const view = render(<CanvasPane {...baseProps} />);
	await screen.findByText("Drag a block here from a note.");
	const nameInput = screen.getByRole("textbox", {
		name: "Canvas name",
	}) as HTMLInputElement;
	// There is no canvas switcher: the sidebar and tabs are how you change canvas.
	expect(screen.queryByRole("combobox")).toBeNull();

	// A new canvas starts as "Untitled canvas" with the field focused and selected.
	await waitFor(() => {
		expect(nameInput.disabled).toBe(false);
		expect(nameInput.value).toBe("Untitled canvas");
		expect(document.activeElement).toBe(nameInput);
		expect(nameInput.selectionStart).toBe(0);
		expect(nameInput.selectionEnd).toBe("Untitled canvas".length);
	});

	// Escape puts the old name back without renaming.
	fireEvent.change(nameInput, { target: { value: "Abandoned" } });
	fireEvent.keyDown(nameInput, { key: "Escape" });
	expect(nameInput.value).toBe("Untitled canvas");
	fireEvent.blur(nameInput);
	expect(await host.kindOf("Untitled canvas.vnote")).toBe("file");

	// Enter commits the rename and updates header title, file name and open path.
	fireEvent.change(nameInput, { target: { value: "Roadmap" } });
	fireEvent.keyDown(nameInput, { key: "Enter" });
	await waitFor(async () => {
		expect(await host.kindOf("Roadmap.vnote")).toBe("file");
		expect(await host.kindOf("Untitled canvas.vnote")).toBeNull();
	});
	expect(
		parseNote(await host.readText("Roadmap.vnote")).note?.header.title,
	).toBe("Roadmap");
	expect(onSelect).toHaveBeenCalledWith("Roadmap.vnote");
	expect(onRename).toHaveBeenCalledWith(
		"Untitled canvas.vnote",
		"Roadmap.vnote",
		"Roadmap",
	);

	// Case-only rename on blur updates the file name and header title.
	fireEvent.change(nameInput, { target: { value: "roadmap" } });
	fireEvent.blur(nameInput);
	await waitFor(async () =>
		expect((await host.list("")).map((e) => e.name)).toContain("roadmap.vnote"),
	);
	expect(
		parseNote(await host.readText("roadmap.vnote")).note?.header.title,
	).toBe("roadmap");
	expect(onSelect).toHaveBeenLastCalledWith("roadmap.vnote");

	// Duplicate name (including case-only clash) gets " 2" like notes.
	fireEvent.change(nameInput, { target: { value: "taken" } });
	fireEvent.keyDown(nameInput, { key: "Enter" });
	await waitFor(async () =>
		expect(await host.kindOf("taken 2.vnote")).toBe("file"),
	);
	expect(
		parseNote(await host.readText("taken 2.vnote")).note?.header.title,
	).toBe("taken");
	expect(onSelect).toHaveBeenLastCalledWith("taken 2.vnote");

	// Failed rename keeps the old name and shows a notice.
	const moveSpy = vi
		.spyOn(host, "move")
		.mockRejectedValueOnce(new Error("disk busy"));
	fireEvent.change(nameInput, { target: { value: "Blocked" } });
	fireEvent.keyDown(nameInput, { key: "Enter" });
	expect((await screen.findByRole("alert")).textContent).toContain(
		"keeps its old name",
	);
	expect(nameInput.value).toBe("taken");
	expect(onSelect).toHaveBeenLastCalledWith("taken 2.vnote");
	expect(await host.kindOf("taken 2.vnote")).toBe("file");
	expect(await host.kindOf("Blocked.vnote")).toBeNull();
	moveSpy.mockRestore();

	// Changed on disk is never overwritten and keeps the old name with a notice.
	await host.writeTextAtomic("taken 2.vnote", "changed elsewhere");
	fireEvent.change(nameInput, { target: { value: "Overwrite" } });
	fireEvent.keyDown(nameInput, { key: "Enter" });
	expect((await screen.findByRole("alert")).textContent).toContain(
		"changed on disk",
	);
	expect(nameInput.value).toBe("taken");
	expect(await host.readText("taken 2.vnote")).toBe("changed elsewhere");
	view.unmount();

	// Read-only canvas disables the name field.
	render(
		<CanvasPane
			{...baseProps}
			path="Taken.vnote"
			focusName={false}
			canvases={[row("Taken.vnote", "Taken", true)]}
		/>,
	);
	await screen.findByText("Drag a block here from a note.");
	expect(
		(screen.getByRole("textbox", { name: "Canvas name" }) as HTMLInputElement)
			.disabled,
	).toBe(true);
});

it("opens a canvas with an unknown block type read-only and says why", async () => {
	const host = new MemoryHost();
	const made = await createCanvas(host, "", "Board");
	const note = parseNote(await host.readText(made.path)).note;
	if (!note) throw new Error("missing canvas");
	note.blocks = [
		{ id: "z", type: "hologram", parent: null, attrs: { x: 1, y: 2 } },
	];
	await host.writeTextAtomic(made.path, serializeNote(note));
	const before = await host.readText(made.path);
	render(
		<CanvasPane
			host={host}
			path={made.path}
			canvases={[]}
			writable
			onSelect={vi.fn()}
			onDropBlock={vi.fn()}
		/>,
	);
	expect((await screen.findAllByRole("alert"))[0]?.textContent).toContain(
		"hologram",
	);
	expect(
		(screen.getByRole("button", { name: /Add/ }) as HTMLButtonElement).disabled,
	).toBe(true);
	fireEvent.click(screen.getByRole("button", { name: "Drag card" }));
	await Promise.resolve();
	expect(await host.readText(made.path)).toBe(before);
});

it("adds a sticky note from the Add menu and saves it on the canvas", async () => {
	const user = userEvent.setup();
	const host = new MemoryHost();
	const made = await createCanvas(host, "", "Board");
	render(
		<CanvasPane
			host={host}
			path={made.path}
			canvases={[]}
			writable
			onSelect={vi.fn()}
			onDropBlock={vi.fn()}
		/>,
	);
	await screen.findByText("Drag a block here from a note.");
	await user.click(screen.getByRole("button", { name: /Add/ }));
	await user.click(
		await screen.findByRole("menuitem", { name: "Sticky note" }),
	);
	await waitFor(async () => {
		const blocks = parseNote(await host.readText(made.path)).note?.blocks ?? [];
		expect(blocks.map((b) => b.type)).toEqual(["sticky"]);
		expect(blocks[0]?.attrs).toMatchObject({ h: 140, w: 180 });
	});
	// The new note opens its text field straight away.
	expect(
		await screen.findByRole("textbox", { name: "Text of sticky" }),
	).toBeTruthy();
});

it("keeps only the canvas name in the header and puts Add in the canvas toolbar", async () => {
	const host = new MemoryHost();
	const made = await createCanvas(host, "", "Board");
	render(
		<CanvasPane
			host={host}
			path={made.path}
			canvases={[]}
			writable
			onSelect={vi.fn()}
			onDropBlock={vi.fn()}
		/>,
	);
	await screen.findByText("Drag a block here from a note.");
	const header = document.querySelector(".canvas-bar") as HTMLElement;
	expect(within(header).queryAllByRole("button")).toHaveLength(0);
	expect(screen.queryByRole("button", { name: "New canvas" })).toBeNull();
	expect(screen.queryByRole("button", { name: "Close canvas" })).toBeNull();
	const toolbar = screen.getByRole("toolbar", { name: "Canvas controls" });
	expect(
		within(toolbar).getByRole("button", { name: "Add to canvas" }),
	).toBeTruthy();
});

async function boardWithCard() {
	const host = new MemoryHost();
	const made = await createCanvas(host, "", "Board");
	const note = parseNote(await host.readText(made.path)).note;
	if (!note) throw new Error("missing canvas");
	note.blocks = [
		{
			id: "a",
			type: "paragraph",
			parent: null,
			attrs: { x: 12, y: 30 },
			content: [{ type: "text", text: "Card" }],
		},
	];
	await host.writeTextAtomic(made.path, serializeNote(note));
	const props = {
		host,
		path: made.path,
		canvases: [
			{
				path: made.path,
				title: "Board",
				preview: "",
				readOnly: false,
				kind: "canvas" as const,
				tags: [],
			},
		],
		writable: true,
		onSelect: vi.fn(),
		onDropBlock: vi.fn(),
	};
	return { host, path: made.path, props };
}
const positionOnDisk = async (host: MemoryHost, path: string) =>
	parseNote(await host.readText(path)).note?.blocks[0]?.attrs;

it("undoes and redoes a move, and the file follows each step", async () => {
	const user = userEvent.setup();
	const { host, path, props } = await boardWithCard();
	render(<CanvasPane {...props} />);
	await screen.findByText("Card");
	const undo = screen.getByRole("button", {
		name: "Undo",
	}) as HTMLButtonElement;
	const redo = screen.getByRole("button", {
		name: "Redo",
	}) as HTMLButtonElement;
	expect(undo.disabled).toBe(true);
	await user.click(screen.getByRole("button", { name: "Drag card" }));
	await waitFor(async () =>
		expect(await positionOnDisk(host, path)).toMatchObject({ x: 88, y: 99 }),
	);
	await waitFor(() => expect(undo.disabled).toBe(false));
	await user.click(undo);
	await waitFor(async () =>
		expect(await positionOnDisk(host, path)).toMatchObject({ x: 12, y: 30 }),
	);
	await waitFor(() => expect(redo.disabled).toBe(false));
	await user.click(redo);
	await waitFor(async () =>
		expect(await positionOnDisk(host, path)).toMatchObject({ x: 88, y: 99 }),
	);
});

it("undoes with the keyboard, and refuses (and clears history) if the file changed on disk", async () => {
	const user = userEvent.setup();
	const { host, path, props } = await boardWithCard();
	render(<CanvasPane {...props} />);
	await screen.findByText("Card");
	await user.click(screen.getByRole("button", { name: "Drag card" }));
	const undo = screen.getByRole("button", {
		name: "Undo",
	}) as HTMLButtonElement;
	await waitFor(() => expect(undo.disabled).toBe(false));
	// Something else edits the file: undo must not overwrite it.
	const edited = `${await host.readText(path)}\n`;
	await host.writeTextAtomic(path, edited);
	fireEvent.keyDown(screen.getByRole("region", { name: "Canvas view" }), {
		key: "z",
		ctrlKey: true,
	});
	expect(await screen.findByText(/changed on disk/)).toBeTruthy();
	expect(await host.readText(path)).toBe(edited);
	await waitFor(() => expect(undo.disabled).toBe(true));
});

it("remembers the snap-to-grid choice", async () => {
	const user = userEvent.setup();
	const { props } = await boardWithCard();
	render(<CanvasPane {...props} />);
	await screen.findByText("Card");
	const snap = screen.getByRole("button", { name: "Snap to grid" });
	expect(snap.getAttribute("aria-pressed")).toBe("false");
	await user.click(snap);
	expect(snap.getAttribute("aria-pressed")).toBe("true");
	expect(localStorage.getItem("vaultops:canvas-snap")).toBe("true");
});

it("two Ctrl+Z presses in one tick undo two steps and leave a coherent history", async () => {
	const user = userEvent.setup();
	const { host, path, props } = await boardWithCard();
	render(<CanvasPane {...props} />);
	await screen.findByText("Card");
	const stickies = async () =>
		(parseNote(await host.readText(path)).note?.blocks ?? []).filter(
			(block) => block.type === "sticky",
		).length;
	for (const count of [1, 2]) {
		await user.click(screen.getByRole("button", { name: /Add/ }));
		await user.click(
			await screen.findByRole("menuitem", { name: "Sticky note" }),
		);
		await waitFor(async () => expect(await stickies()).toBe(count));
		(document.activeElement as HTMLElement | null)?.blur?.();
	}
	const region = screen.getByRole("region", { name: "Canvas view" });
	fireEvent.keyDown(region, { key: "z", ctrlKey: true });
	fireEvent.keyDown(region, { key: "z", ctrlKey: true });
	await waitFor(async () => expect(await stickies()).toBe(0));
	const undo = screen.getByRole("button", {
		name: "Undo",
	}) as HTMLButtonElement;
	const redo = screen.getByRole("button", {
		name: "Redo",
	}) as HTMLButtonElement;
	await waitFor(() => expect(undo.disabled).toBe(true));
	expect(redo.disabled).toBe(false);
});

it("remembers snapping to objects beside the grid, under the one setting", async () => {
	const user = userEvent.setup();
	const { props } = await boardWithCard();
	localStorage.setItem("vaultops:canvas-snap", "true");
	render(<CanvasPane {...props} />);
	await screen.findByText("Card");
	const grid = screen.getByRole("button", { name: "Snap to grid" });
	const objects = screen.getByRole("button", { name: "Snap to objects" });
	// An earlier "true" still means the grid alone.
	expect(grid.getAttribute("aria-pressed")).toBe("true");
	expect(objects.getAttribute("aria-pressed")).toBe("false");
	expect(screen.getByTestId("mock-canvas").dataset.snapObjects).toBe("false");
	await user.click(objects);
	expect(objects.getAttribute("aria-pressed")).toBe("true");
	expect(screen.getByTestId("mock-canvas").dataset.snapObjects).toBe("true");
	expect(localStorage.getItem("vaultops:canvas-snap")).toBe("both");
	await user.click(grid);
	expect(localStorage.getItem("vaultops:canvas-snap")).toBe("objects");
	await user.click(objects);
	expect(localStorage.getItem("vaultops:canvas-snap")).toBe("false");
});

async function boardWithThreeStickies() {
	const host = new MemoryHost();
	const made = await createCanvas(host, "", "Board");
	const note = parseNote(await host.readText(made.path)).note;
	if (!note) throw new Error("missing canvas");
	const sticky = (id: string, x: number, y: number, w: number, h: number) => ({
		id,
		type: "sticky",
		parent: null,
		attrs: { x, y, w, h },
	});
	note.blocks = [
		sticky("a", 0, 10, 100, 40),
		sticky("b", 150, 80, 60, 20),
		sticky("c", 300, 30, 80, 60),
	];
	await host.writeTextAtomic(made.path, serializeNote(note));
	mockSelection = ["a", "b", "c"];
	mockBoxes = {
		a: { x: 0, y: 10, w: 100, h: 40 },
		b: { x: 150, y: 80, w: 60, h: 20 },
		c: { x: 300, y: 30, w: 80, h: 60 },
	};
	const props = {
		host,
		path: made.path,
		canvases: [
			{
				path: made.path,
				title: "Board",
				preview: "",
				readOnly: false,
				kind: "canvas" as const,
				tags: [],
			},
		],
		writable: true,
		onSelect: vi.fn(),
		onDropBlock: vi.fn(),
	};
	const places = async () =>
		Object.fromEntries(
			(parseNote(await host.readText(made.path)).note?.blocks ?? []).map(
				(b) => [b.id, [attrsOf(b).x, attrsOf(b).y]],
			),
		);
	return { host, path: made.path, props, places };
}

it("aligns the selected items in one checked write, and one undo puts them all back", async () => {
	const user = userEvent.setup();
	const { host, props, places } = await boardWithThreeStickies();
	const writes = vi.spyOn(host, "writeTextAtomic");
	render(<CanvasPane {...props} />);
	await screen.findByRole("toolbar", { name: "Selection" });
	await user.click(screen.getByRole("button", { name: "Align left" }));
	await waitFor(async () =>
		expect(await places()).toEqual({
			a: [0, 10],
			b: [0, 80],
			c: [0, 30],
		}),
	);
	expect(writes).toHaveBeenCalledTimes(1);
	await user.click(screen.getByRole("button", { name: "Undo" }));
	await waitFor(async () =>
		expect(await places()).toEqual({
			a: [0, 10],
			b: [150, 80],
			c: [300, 30],
		}),
	);
	await user.click(screen.getByRole("button", { name: "Redo" }));
	await waitFor(async () => expect((await places()).b).toEqual([0, 80]));
});

it("distributes three items evenly and offers it only for three or more", async () => {
	const user = userEvent.setup();
	const { props, places } = await boardWithThreeStickies();
	const view = render(<CanvasPane {...props} />);
	await user.click(
		await screen.findByRole("button", { name: "Distribute horizontally" }),
	);
	// span 0..380, widths 240, gaps of 70
	await waitFor(async () =>
		expect(await places()).toEqual({
			a: [0, 10],
			b: [170, 80],
			c: [300, 30],
		}),
	);
	view.unmount();
	mockSelection = ["a", "b"];
	render(<CanvasPane {...props} />);
	await screen.findByRole("button", { name: "Align top" });
	expect(
		(
			screen.getByRole("button", {
				name: "Distribute horizontally",
			}) as HTMLButtonElement
		).disabled,
	).toBe(true);
	expect(
		(screen.getByRole("button", { name: "Align top" }) as HTMLButtonElement)
			.disabled,
	).toBe(false);
});

it("refuses to arrange when the file changed on disk, and leaves it as it is", async () => {
	const user = userEvent.setup();
	const { host, path, props } = await boardWithThreeStickies();
	render(<CanvasPane {...props} />);
	const button = await screen.findByRole("button", { name: "Align top" });
	const edited = `${await host.readText(path)}\n`;
	await host.writeTextAtomic(path, edited);
	await user.click(button);
	expect(await screen.findByText(/changed on disk/)).toBeTruthy();
	expect(await host.readText(path)).toBe(edited);
});

it("writes nothing when asked to arrange a read-only canvas", async () => {
	const user = userEvent.setup();
	const { host, path, props } = await boardWithThreeStickies();
	const before = await host.readText(path);
	const writes = vi.spyOn(host, "writeTextAtomic");
	render(<CanvasPane {...props} writable={false} />);
	await user.click(await screen.findByRole("button", { name: "Align left" }));
	expect(writes).not.toHaveBeenCalled();
	expect(await host.readText(path)).toBe(before);
});

it("changes the color of the selected sticky notes in one checked write, and undo puts it back", async () => {
	const user = userEvent.setup();
	const { host, props } = await boardWithThreeStickies();
	const tones = async () =>
		(parseNote(await host.readText(props.path)).note?.blocks ?? []).map(
			(b) => attrsOf(b).tone ?? "note",
		);
	const writes = vi.spyOn(host, "writeTextAtomic");
	render(<CanvasPane {...props} />);
	await user.click(await screen.findByRole("button", { name: /Style/ }));
	await user.click(await screen.findByRole("button", { name: "Danger" }));
	await waitFor(async () =>
		expect(await tones()).toEqual(["danger", "danger", "danger"]),
	);
	expect(writes).toHaveBeenCalledTimes(1);
	await user.click(screen.getByRole("button", { name: "Undo" }));
	await waitFor(async () =>
		expect(await tones()).toEqual(["note", "note", "note"]),
	);
});

it("refuses to color when the file changed on disk", async () => {
	const user = userEvent.setup();
	const { host, path, props } = await boardWithThreeStickies();
	render(<CanvasPane {...props} />);
	const open = await screen.findByRole("button", { name: /Style/ });
	const edited = `${await host.readText(path)}\n`;
	await host.writeTextAtomic(path, edited);
	await user.click(open);
	await user.click(await screen.findByRole("button", { name: "Tip" }));
	expect(await screen.findByText(/changed on disk/)).toBeTruthy();
	expect(await host.readText(path)).toBe(edited);
});

it("shows a card's canvas color, and a colored card is colored through the menu and undone in one step", async () => {
	const user = userEvent.setup();
	const { host, path, props } = await boardWithCard();
	mockSelection = ["a"];
	mockBoxes = { a: { x: 12, y: 30, w: 100, h: 40 } };
	render(<CanvasPane {...props} />);
	await screen.findByText("Card");
	const article = () => screen.getByText("Card").closest(".canvas-card");
	expect(article()?.getAttribute("data-tone")).toBeNull();
	await user.click(screen.getByRole("button", { name: /Style/ }));
	await user.click(await screen.findByRole("button", { name: "Warning" }));
	await waitFor(() =>
		expect(article()?.getAttribute("data-tone")).toBe("warning"),
	);
	const saved = parseNote(await host.readText(path)).note?.blocks[0];
	expect(saved && attrsOf(saved)).toMatchObject({
		x: 12,
		y: 30,
		fill: "warning",
	});
	await user.click(screen.getByRole("button", { name: "Undo" }));
	await waitFor(() => expect(article()?.getAttribute("data-tone")).toBeNull());
});

it("brings an item to the front in one checked write, and undo puts the order back", async () => {
	const user = userEvent.setup();
	const { host, path, props } = await boardWithThreeStickies();
	mockSelection = ["a"];
	const writes = vi.spyOn(host, "writeTextAtomic");
	render(<CanvasPane {...props} />);
	await user.click(await screen.findByRole("button", { name: /Order/ }));
	await user.click(screen.getByRole("menuitem", { name: /Bring to front/ }));
	const order = async () =>
		(parseNote(await host.readText(path)).note?.blocks ?? []).map((b) => b.id);
	await waitFor(async () => expect(await order()).toEqual(["b", "c", "a"]));
	expect(writes).toHaveBeenCalledTimes(1);
	// Positions are untouched: only the order of the lines changed.
	const blocks = parseNote(await host.readText(path)).note?.blocks ?? [];
	expect(attrsOf(blocks[2] as never).x).toBe(0);
	await user.click(screen.getByRole("button", { name: "Undo" }));
	await waitFor(async () => expect(await order()).toEqual(["a", "b", "c"]));
});

it("sends an item backward past the next one it overlaps", async () => {
	const user = userEvent.setup();
	const { host, path, props } = await boardWithThreeStickies();
	mockSelection = ["c"];
	// c sits clear of b but overlaps a, so one step back goes behind a.
	mockBoxes = {
		a: { x: 280, y: 20, w: 100, h: 100 },
		b: { x: 0, y: 0, w: 10, h: 10 },
		c: { x: 300, y: 30, w: 80, h: 60 },
	};
	render(<CanvasPane {...props} />);
	await user.click(await screen.findByRole("button", { name: /Order/ }));
	await user.click(screen.getByRole("menuitem", { name: /Send backward/ }));
	await waitFor(async () =>
		expect(
			(parseNote(await host.readText(path)).note?.blocks ?? []).map(
				(b) => b.id,
			),
		).toEqual(["c", "a", "b"]),
	);
});

it("changes a shape's outline and the text size in one checked write each, and undo puts them back", async () => {
	const user = userEvent.setup();
	const { host, path, props } = await boardWithThreeStickies();
	const note = parseNote(await host.readText(path)).note;
	if (!note) throw new Error("fixture");
	await host.writeTextAtomic(
		path,
		serializeNote({
			...note,
			blocks: [
				{
					id: "a",
					type: "shape",
					parent: null,
					attrs: { x: 0, y: 10, w: 100, h: 40 },
				},
				...note.blocks.slice(1),
			],
		}),
	);
	mockSelection = ["a"];
	const attrs = async () =>
		attrsOf(
			(parseNote(await host.readText(path)).note?.blocks ?? [])[0] as never,
		);
	const writes = vi.spyOn(host, "writeTextAtomic");
	render(<CanvasPane {...props} />);
	await user.click(await screen.findByRole("button", { name: /Style/ }));
	await user.click(await screen.findByRole("button", { name: "Diamond" }));
	await waitFor(async () => expect((await attrs()).shape).toBe("diamond"));
	await user.click(screen.getByRole("button", { name: "Large" }));
	await waitFor(async () => expect((await attrs()).size).toBe("l"));
	expect(writes).toHaveBeenCalledTimes(2);
	// The two edits are two undo steps and nothing else about the shape moved.
	expect(await attrs()).toMatchObject({ x: 0, y: 10, w: 100, h: 40 });
	await user.click(screen.getByRole("button", { name: "Undo" }));
	await waitFor(async () => expect((await attrs()).size).toBeUndefined());
	expect((await attrs()).shape).toBe("diamond");
	await user.click(screen.getByRole("button", { name: "Undo" }));
	await waitFor(async () => expect((await attrs()).shape).toBeUndefined());
});

async function boardWithMeetingNote() {
	const host = new MemoryHost();
	const made = await createCanvas(host, "", "Board");
	await host.writeTextAtomic(
		"Meeting.vnote",
		serializeNote({
			header: {
				format: "vaultops-note",
				v: 1,
				noteId: "n-meet",
				title: "Meeting",
			},
			blocks: [
				{
					id: "p1",
					type: "paragraph",
					parent: null,
					content: [{ type: "text", text: "Ship the canvas" }],
				},
			],
		}),
	);
	const meetingRow = (patch = {}) => ({
		path: "Meeting.vnote",
		id: "n-meet",
		title: "Meeting",
		preview: "Ship the canvas",
		readOnly: false,
		kind: "note" as const,
		tags: [],
		...patch,
	});
	const props = {
		host,
		path: made.path,
		canvases: [
			{
				path: made.path,
				title: "Board",
				preview: "",
				readOnly: false,
				kind: "canvas" as const,
				tags: [],
			},
		],
		notes: [meetingRow()],
		writable: true,
		onSelect: vi.fn(),
		onDropBlock: vi.fn(),
	};
	return { host, path: made.path, props, meetingRow };
}

it("embeds a note from the Add menu: pick it by title, it is saved with the note's id, and undo removes it", async () => {
	const user = userEvent.setup();
	const { host, path, props } = await boardWithMeetingNote();
	const write = vi.spyOn(host, "writeTextAtomic");
	render(<CanvasPane {...props} />);
	await screen.findByText("Drag a block here from a note.");
	await user.click(screen.getByRole("button", { name: /Add/ }));
	await user.click(
		await screen.findByRole("menuitem", { name: "Embed a note..." }),
	);
	await user.type(screen.getByRole("combobox"), "mee");
	await user.click(await screen.findByText("Meeting"));
	await waitFor(async () => {
		const blocks = parseNote(await host.readText(path)).note?.blocks ?? [];
		expect(blocks.map((b) => b.type)).toEqual(["embed"]);
		expect(blocks[0]?.attrs).toMatchObject({ note: "n-meet", h: 240, w: 320 });
	});
	// The embed shows the note, and only the canvas file was written.
	expect(await screen.findByText("Ship the canvas")).toBeTruthy();
	expect(write.mock.calls.map((call) => call[0])).toEqual([path]);
	await user.click(screen.getByRole("button", { name: "Undo" }));
	await waitFor(async () =>
		expect(parseNote(await host.readText(path)).note?.blocks).toEqual([]),
	);
});

it("cannot embed when the vault has no other notes, and never lists canvases", async () => {
	const user = userEvent.setup();
	const { props, path } = await boardWithMeetingNote();
	render(
		<CanvasPane
			{...props}
			notes={[
				{
					path,
					id: "board",
					title: "Board",
					preview: "",
					readOnly: false,
					kind: "canvas",
					tags: [],
				},
			]}
		/>,
	);
	await user.click(await screen.findByRole("button", { name: /Add/ }));
	expect(
		(
			await screen.findByRole("menuitem", { name: "Embed a note..." })
		).getAttribute("aria-disabled"),
	).toBe("true");
});

it("still shows an embedded note after it is renamed, because the embed holds its id", async () => {
	const { host, path, props, meetingRow } = await boardWithMeetingNote();
	const note = parseNote(await host.readText(path)).note;
	if (!note) throw new Error("fixture");
	await host.writeTextAtomic(
		path,
		serializeNote({
			...note,
			blocks: [
				{
					id: "e1",
					type: "embed",
					parent: null,
					attrs: { note: "n-meet", x: 0, y: 0, w: 320, h: 240 },
				},
			],
		}),
	);
	await host.writeTextAtomic(
		"Renamed.vnote",
		await host.readText("Meeting.vnote"),
	);
	const onOpenNote = vi.fn();
	const user = userEvent.setup();
	render(
		<CanvasPane
			{...props}
			onOpenNote={onOpenNote}
			notes={[meetingRow({ path: "Renamed.vnote", title: "Renamed" })]}
		/>,
	);
	expect(await screen.findByText("Ship the canvas")).toBeTruthy();
	await user.click(screen.getByRole("button", { name: "Open Renamed" }));
	expect(onOpenNote).toHaveBeenCalledWith("Renamed.vnote");
});

it("keeps an embed whose note is gone, and deleting the embed leaves the note alone", async () => {
	const { host, path, props } = await boardWithMeetingNote();
	const note = parseNote(await host.readText(path)).note;
	if (!note) throw new Error("fixture");
	await host.writeTextAtomic(
		path,
		serializeNote({
			...note,
			blocks: [
				{
					id: "e1",
					type: "embed",
					parent: null,
					attrs: { note: "n-gone", x: 0, y: 0, w: 320, h: 240 },
				},
			],
		}),
	);
	const user = userEvent.setup();
	mockSelection = ["e1"];
	const meetingBefore = await host.readText("Meeting.vnote");
	render(<CanvasPane {...props} />);
	expect(await screen.findByText(/not in the vault/)).toBeTruthy();
	// The canvas is editable (an embed is a known type), and the link is kept in the file.
	expect(screen.queryByText(/read-only/)).toBeNull();
	expect(
		parseNote(await host.readText(path)).note?.blocks[0]?.attrs,
	).toMatchObject({ note: "n-gone" });
	await user.click(await screen.findByRole("button", { name: "Delete" }));
	await user.click(screen.getByRole("button", { name: "Delete" }));
	await waitFor(async () =>
		expect(parseNote(await host.readText(path)).note?.blocks).toEqual([]),
	);
	expect(await host.readText("Meeting.vnote")).toBe(meetingBefore);
});
