// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { parseNote, serializeNote } from "../core/note-format";
import { createCanvas } from "../core/notes/repository";
import { MemoryHost } from "../host/memory-host";
import { CanvasPane } from "./CanvasPane";

vi.mock("@/components/ui/canvas", () => ({
	Canvas: ({
		nodes,
		onMove,
	}: {
		nodes: {
			id: string;
			position: { x: number; y: number };
			data: { label: React.ReactNode };
		}[];
		onMove: (id: string, position: { x: number; y: number }) => void;
	}) => (
		<div>
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
