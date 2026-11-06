// @vitest-environment happy-dom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { DragEvent } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { canvasFlowProps } from "@/components/ui/canvas";
import { parseNote, serializeNote } from "../core/note-format";
import { createCanvas } from "../core/notes/repository";
import { BLOCK_DRAG_TYPE } from "../editor/block-drag";
import { MemoryHost } from "../host/memory-host";
import { CanvasPane } from "./CanvasPane";

/** The id of the canvas under test, for a card dropped back where it came from. */
let ownCanvasId = "";

vi.mock("@/components/ui/canvas", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("@/components/ui/canvas")>();
	return {
		...actual,
		Canvas: ({
			nodes,
			locked = false,
			onMove,
			onDropBlock,
		}: {
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
		onNew: vi.fn(),
		onClose: vi.fn(),
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
		onNew: vi.fn(),
		onClose: vi.fn(),
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
			onNew={vi.fn()}
			onClose={vi.fn()}
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
		onNew: vi.fn(),
		onClose: vi.fn(),
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
		onNew: vi.fn(),
		onClose: vi.fn(),
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
			onNew={vi.fn()}
			onClose={vi.fn()}
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
			onNew={vi.fn()}
			onClose={vi.fn()}
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
		onNew: vi.fn(),
		onClose: vi.fn(),
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
