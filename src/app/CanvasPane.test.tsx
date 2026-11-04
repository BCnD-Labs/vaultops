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
