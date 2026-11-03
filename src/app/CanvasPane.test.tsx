// @vitest-environment happy-dom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import type { DragEvent } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { parseNote, serializeNote } from "../core/note-format";
import { createCanvas } from "../core/notes/repository";
import { BLOCK_DRAG_TYPE } from "../editor/block-drag";
import { MemoryHost } from "../host/memory-host";
import { CanvasPane } from "./CanvasPane";

vi.mock("@/components/ui/canvas", () => ({
	Canvas: ({
		nodes,
		onMove,
		onDropBlock,
	}: {
		nodes: {
			id: string;
			position: { x: number; y: number };
			data: { label: React.ReactNode };
		}[];
		onMove: (id: string, position: { x: number; y: number }) => void;
		onDropBlock: (event: DragEvent, position: { x: number; y: number }) => void;
	}) => (
		<div>
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
				<div key={node.id}>
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
}));

afterEach(cleanup);

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
