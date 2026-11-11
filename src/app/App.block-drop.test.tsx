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
import type { JSONContent } from "@tiptap/core";
import { type DragEvent, useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { parseNote, serializeNote } from "../core/note-format";
import { createCanvas, createNote } from "../core/notes/repository";
import { BLOCK_DRAG_TYPE } from "../editor/block-drag";
import { MemoryHost } from "../host/memory-host";
import { App } from "./App";
import { loadVault } from "./session";

let dragNoteId = "";
let dragCanvasId = "";

vi.mock("../editor/NoteEditor", () => ({
	NoteEditor: ({
		doc,
		onChange,
		onDropBlock,
		editable,
	}: {
		editable?: boolean;
		doc: JSONContent;
		onChange: (doc: JSONContent) => void;
		onDropBlock: (
			blockId: string,
			canvasId: string,
			slot: { after: string | null; near: string[]; start: boolean },
		) => Promise<void>;
	}) => {
		const [initial] = useState(doc);
		return (
			<div>
				<output data-testid="editor-blocks">{JSON.stringify(initial)}</output>
				<output data-testid="editable">{String(editable)}</output>
				<button
					type="button"
					onClick={() =>
						void onDropBlock("block", dragCanvasId, {
							after: "before",
							near: [],
							start: false,
						})
					}
				>
					Drop between blocks
				</button>
				<button
					type="button"
					onClick={() =>
						void onDropBlock("block", dragCanvasId, {
							after: null,
							near: [],
							start: false,
						})
					}
				>
					Drop at end
				</button>
				<button
					type="button"
					onClick={() =>
						onChange({
							...doc,
							content: [
								...(doc.content ?? []),
								{
									type: "paragraph",
									attrs: { id: "draft" },
									content: [{ type: "text", text: "Unsaved" }],
								},
							],
						})
					}
				>
					Edit note
				</button>
			</div>
		);
	},
}));

vi.mock("@/components/ui/canvas", () => ({
	Canvas: ({
		nodes,
		onDropBlock,
	}: {
		nodes: { id: string; data: { label: React.ReactNode } }[];
		onDropBlock: (event: DragEvent, position: { x: number; y: number }) => void;
	}) => (
		<div>
			{nodes.map((node) => (
				<div key={node.id}>{node.data.label}</div>
			))}
			<button
				type="button"
				onClick={() => {
					const dataTransfer = new DataTransfer();
					dataTransfer.setData(
						BLOCK_DRAG_TYPE,
						JSON.stringify({ noteId: dragNoteId, blockId: "block" }),
					);
					onDropBlock({ dataTransfer } as DragEvent, { x: 42, y: 67 });
				}}
			>
				Drop block
			</button>
		</div>
	),
}));

// These tests drive the notebook-navigator layout (folders plus a notes list).
beforeEach(() => {
	localStorage.setItem("vaultops:sidebar-mode", "navigator");
});

afterEach(() => {
	cleanup();
	localStorage.clear();
});

async function setup(readOnly = false) {
	const host = new MemoryHost();
	await loadVault(host);
	const note = await createNote(host, "", "Essay", {
		header: { format: "vaultops-note", v: 1, noteId: "source" },
		blocks: [
			{ id: "block", type: "bulletList", parent: null },
			{ id: "item", type: "listItem", parent: "block" },
			{
				id: "child",
				type: "paragraph",
				parent: "item",
				content: [{ type: "text", text: "Move me" }],
			},
		],
	});
	const canvas = await createCanvas(host, "", "Board");
	dragNoteId = note.note.header.noteId;
	dragCanvasId = canvas.note.header.noteId;
	if (readOnly)
		await host.writeTextAtomic(
			note.path,
			`${await host.readText(note.path)}bad\n`,
		);
	return { host, note, canvas };
}

async function openEditorAndCanvas(host: MemoryHost) {
	render(<App host={host} />);
	await screen.findByRole("textbox", { name: "Title" });
	// A canvas opens as a tab of its own; "Split view" on its tab puts it beside
	// the note again, which is where blocks can be dragged between the two.
	fireEvent.click(screen.getByTitle("Board.vnote"));
	await screen.findByRole("region", { name: "Canvas view" });
	expect(screen.queryByRole("textbox", { name: "Title" })).toBeNull();
	const tab = screen.getByRole("tab", { name: "Board" }).parentElement;
	fireEvent.contextMenu(tab as HTMLElement);
	fireEvent.click(await screen.findByRole("menuitem", { name: "Split view" }));
	await screen.findByRole("textbox", { name: "Title" });
	await screen.findByRole("region", { name: "Canvas view" });
	// An empty canvas has no card to wait for; the pane says when it has loaded.
	await waitFor(() =>
		expect(
			screen
				.getByRole("region", { name: "Canvas view" })
				.getAttribute("aria-busy"),
		).toBe("false"),
	);
}

it("saves unsaved edits, moves a list and its children, and updates both panes", async () => {
	const { host, note, canvas } = await setup();
	await openEditorAndCanvas(host);
	await screen.findByTestId("editor-blocks");
	fireEvent.click(screen.getByRole("button", { name: "Edit note" }));
	fireEvent.click(screen.getByRole("button", { name: "Drop block" }));
	await waitFor(async () => {
		const source = parseNote(await host.readText(note.path)).note;
		const target = parseNote(await host.readText(canvas.path)).note;
		expect(source?.blocks.map((block) => block.id)).toEqual(["draft"]);
		expect(target?.blocks.map((block) => block.id)).toEqual([
			"block",
			"item",
			"child",
		]);
		expect(target?.blocks[0]?.attrs).toMatchObject({ x: 42, y: 67 });
		expect(screen.getByTestId("editor-blocks").textContent).not.toContain(
			"block",
		);
		expect(
			within(screen.getByRole("region", { name: "Canvas view" })).getByText(
				"Move me",
			),
		).toBeTruthy();
	});
	fireEvent.click(screen.getByRole("button", { name: "Close Board" }));
	cleanup();
	localStorage.clear();
	localStorage.setItem("vaultops:sidebar-mode", "navigator");
	await openEditorAndCanvas(host);
	expect(screen.getByTestId("editor-blocks").textContent).not.toContain(
		"block",
	);
	expect(
		within(screen.getByRole("region", { name: "Canvas view" })).getByText(
			"Move me",
		),
	).toBeTruthy();
});

it("puts the note back and says nothing moved after a failed source write", async () => {
	const { host, note, canvas } = await setup();
	await openEditorAndCanvas(host);
	const write = vi.spyOn(host, "writeTextAtomic");
	write.mockImplementation(async (path, text) => {
		if (path === note.path) throw new Error("disk full");
		return MemoryHost.prototype.writeTextAtomic.call(host, path, text);
	});
	fireEvent.click(screen.getByRole("button", { name: "Drop block" }));
	await waitFor(() => {
		const alert = screen.getByRole("alert");
		expect(alert.textContent).toContain("was not moved");
		expect(alert.textContent).toContain(note.path);
	});
	expect(parseNote(await host.readText(note.path)).note?.blocks[0]?.id).toBe(
		"block",
	);
	// The canvas was put back too, so the block is in one place only.
	expect(parseNote(await host.readText(canvas.path)).note?.blocks).toEqual([]);
});

async function moveNotice() {
	return (await screen.findByText(/Moved a block to/)).closest(
		"p",
	) as HTMLElement;
}

it("offers Undo after a move, and Undo puts both files back exactly", async () => {
	const { host, note, canvas } = await setup();
	const noteBefore = await host.readText(note.path);
	const canvasBefore = await host.readText(canvas.path);
	await openEditorAndCanvas(host);
	fireEvent.click(screen.getByRole("button", { name: "Drop block" }));
	const status = await moveNotice();
	expect(status.textContent).toContain('Moved a block to "Board"');
	await waitFor(async () =>
		expect(
			parseNote(await host.readText(canvas.path)).note?.blocks,
		).toHaveLength(3),
	);
	fireEvent.click(within(status).getByRole("button", { name: "Undo" }));
	await waitFor(async () => {
		expect(await host.readText(note.path)).toBe(noteBefore);
		expect(await host.readText(canvas.path)).toBe(canvasBefore);
	});
	expect(screen.queryByText(/Moved a block to/)).toBeNull();
	expect(screen.queryByRole("alert")).toBeNull();
});

it("says why Undo cannot run when a file changed after the move", async () => {
	const { host, note } = await setup();
	await openEditorAndCanvas(host);
	fireEvent.click(screen.getByRole("button", { name: "Drop block" }));
	const status = await moveNotice();
	await waitFor(async () =>
		expect(parseNote(await host.readText(note.path)).note?.blocks).toHaveLength(
			0,
		),
	);
	await host.writeTextAtomic(
		note.path,
		`${await host.readText(note.path)}${JSON.stringify({ id: "later", type: "paragraph", parent: null })}\n`,
	);
	fireEvent.click(within(status).getByRole("button", { name: "Undo" }));
	expect((await screen.findByRole("alert")).textContent).toContain(
		"can't be undone here",
	);
});

it("does not let the note be typed in while a block is on its way", async () => {
	const { host, note, canvas } = await setup();
	await openEditorAndCanvas(host);
	await screen.findByTestId("editable");
	expect(screen.getByTestId("editable").textContent).toBe("true");
	const write = vi.spyOn(host, "writeTextAtomic");
	write.mockImplementation(async (path, text) => {
		await new Promise((resolve) => setTimeout(resolve, 40));
		return MemoryHost.prototype.writeTextAtomic.call(host, path, text);
	});
	const seen = new Set<string>();
	const poll = setInterval(
		() => seen.add(screen.getByTestId("editable").textContent ?? ""),
		5,
	);
	fireEvent.click(screen.getByRole("button", { name: "Drop block" }));
	await moveNotice();
	clearInterval(poll);
	// Locked while the block was moving, typeable again afterwards.
	expect(seen.has("false")).toBe(true);
	expect(screen.getByTestId("editable").textContent).toBe("true");
	expect(parseNote(await host.readText(canvas.path)).note?.blocks).toHaveLength(
		3,
	);
	expect(parseNote(await host.readText(note.path)).note?.blocks).toHaveLength(
		0,
	);
});

it("refuses the move when unsaved edits cannot be saved", async () => {
	const { host, note, canvas } = await setup();
	await openEditorAndCanvas(host);
	const write = vi.spyOn(host, "writeTextAtomic");
	write.mockImplementation(async (path, text) => {
		if (path === note.path) throw new Error("disk full");
		return MemoryHost.prototype.writeTextAtomic.call(host, path, text);
	});
	fireEvent.click(screen.getByRole("button", { name: "Edit note" }));
	fireEvent.click(screen.getByRole("button", { name: "Drop block" }));
	await waitFor(() =>
		expect(
			within(screen.getByRole("region", { name: "Canvas view" })).getByRole(
				"alert",
			).textContent,
		).toContain("Save the note before moving a block"),
	);
	expect(parseNote(await host.readText(note.path)).note?.blocks[0]?.id).toBe(
		"block",
	);
	expect(parseNote(await host.readText(canvas.path)).note?.blocks).toEqual([]);
});

it("refuses a drop from a read-only note", async () => {
	const { host, note, canvas } = await setup(true);
	await openEditorAndCanvas(host);
	fireEvent.click(screen.getByRole("button", { name: "Drop block" }));
	expect((await screen.findByRole("alert")).textContent).toContain("read-only");
	expect(parseNote(await host.readText(note.path)).note?.blocks[0]?.id).toBe(
		"block",
	);
	expect(parseNote(await host.readText(canvas.path)).note?.blocks).toEqual([]);
});

it("moves a canvas card between note blocks, keeps its id, and reloads both panes", async () => {
	const { host, note, canvas } = await setup();
	const parsed = parseNote(await host.readText(note.path)).note;
	if (!parsed) throw new Error("missing note");
	parsed.blocks = [
		{ id: "before", type: "paragraph", parent: null },
		...parsed.blocks,
		{ id: "after", type: "paragraph", parent: null },
	];
	await host.writeTextAtomic(note.path, serializeNote(parsed));
	await openEditorAndCanvas(host);
	fireEvent.click(screen.getByRole("button", { name: "Drop block" }));
	await waitFor(async () =>
		expect(
			parseNote(await host.readText(canvas.path)).note?.blocks[0]?.id,
		).toBe("block"),
	);
	fireEvent.click(screen.getByRole("button", { name: "Drop between blocks" }));
	await waitFor(async () => {
		const saved = parseNote(await host.readText(note.path)).note;
		expect(saved?.blocks.map((block) => block.id)).toEqual([
			"before",
			"block",
			"item",
			"child",
			"after",
		]);
		expect(saved?.blocks[1]?.attrs).toBeUndefined();
		expect(parseNote(await host.readText(canvas.path)).note?.blocks).toEqual(
			[],
		);
		expect(screen.getByTestId("editor-blocks").textContent).toContain("block");
	});
	cleanup();
	localStorage.clear();
	localStorage.setItem("vaultops:sidebar-mode", "navigator");
	await openEditorAndCanvas(host);
	expect(screen.getByTestId("editor-blocks").textContent).toContain("block");
	expect(
		within(screen.getByRole("region", { name: "Canvas view" })).queryByText(
			"Move me",
		),
	).toBeNull();
});

it("moves a card to the end through its menu", async () => {
	const user = userEvent.setup();
	const { host, note, canvas } = await setup();
	await openEditorAndCanvas(host);
	fireEvent.click(screen.getByRole("button", { name: "Drop block" }));
	await user.click(await screen.findByRole("button", { name: "Card actions" }));
	await user.click(
		await screen.findByRole("menuitem", { name: "Move to open note" }),
	);
	await waitFor(async () => {
		expect(parseNote(await host.readText(note.path)).note?.blocks[0]?.id).toBe(
			"block",
		);
		expect(parseNote(await host.readText(canvas.path)).note?.blocks).toEqual(
			[],
		);
	});
});

it("refuses a canvas-to-note drop into a read-only note", async () => {
	const { host, note, canvas } = await setup(true);
	const board = parseNote(await host.readText(canvas.path)).note;
	if (!board) throw new Error("missing canvas");
	board.blocks = [
		{
			id: "block",
			type: "paragraph",
			parent: null,
			attrs: { x: 10, y: 20 },
		},
	];
	await host.writeTextAtomic(canvas.path, serializeNote(board));
	await openEditorAndCanvas(host);
	fireEvent.click(screen.getByRole("button", { name: "Drop between blocks" }));
	await waitFor(() =>
		expect(screen.getByRole("alert").textContent).toContain("read-only"),
	);
	expect(parseNote(await host.readText(canvas.path)).note?.blocks[0]?.id).toBe(
		"block",
	);
	expect(parseNote(await host.readText(note.path)).note?.blocks[0]?.id).toBe(
		"block",
	);
});

it("leaves everything as it was if removing the canvas copy fails", async () => {
	const { host, note, canvas } = await setup();
	await openEditorAndCanvas(host);
	fireEvent.click(screen.getByRole("button", { name: "Drop block" }));
	await screen.findByRole("button", { name: "Card actions" });
	const write = vi.spyOn(host, "writeTextAtomic");
	write.mockImplementation(async (path, text) => {
		if (path === canvas.path) throw new Error("disk full");
		return MemoryHost.prototype.writeTextAtomic.call(host, path, text);
	});
	fireEvent.click(screen.getByRole("button", { name: "Drop at end" }));
	await waitFor(() =>
		expect(screen.getByRole("alert").textContent).toContain("was not moved"),
	);
	// The note was put back too: the block is on the canvas only.
	expect(parseNote(await host.readText(note.path)).note?.blocks).toEqual([]);
	expect(parseNote(await host.readText(canvas.path)).note?.blocks[0]?.id).toBe(
		"block",
	);
	// The canvas reloads its cards after a failed move; wait for them to return.
	expect(
		await within(
			screen.getByRole("region", { name: "Canvas view" }),
		).findByText("Move me"),
	).toBeTruthy();
});

it("refuses a return when unsaved note edits cannot be saved", async () => {
	const { host, note, canvas } = await setup();
	await openEditorAndCanvas(host);
	fireEvent.click(screen.getByRole("button", { name: "Drop block" }));
	await screen.findByRole("button", { name: "Card actions" });
	const write = vi.spyOn(host, "writeTextAtomic");
	write.mockImplementation(async (path, text) => {
		if (path === note.path) throw new Error("disk full");
		return MemoryHost.prototype.writeTextAtomic.call(host, path, text);
	});
	fireEvent.click(screen.getByRole("button", { name: "Edit note" }));
	fireEvent.click(screen.getByRole("button", { name: "Drop at end" }));
	await waitFor(() =>
		expect(
			screen
				.getAllByRole("alert")
				.some((alert) =>
					alert.textContent?.includes("Save the note before moving"),
				),
		).toBe(true),
	);
	expect(parseNote(await host.readText(canvas.path)).note?.blocks[0]?.id).toBe(
		"block",
	);
	expect(parseNote(await host.readText(note.path)).note?.blocks).toEqual([]);
});

it("sends a card to any other canvas, open or not, from its Move to… menu", async () => {
	const user = userEvent.setup();
	const { host, canvas } = await setup();
	const other = await createCanvas(host, "", "Second board");
	await openEditorAndCanvas(host);
	fireEvent.click(screen.getByRole("button", { name: "Drop block" }));
	await user.click(await screen.findByRole("button", { name: "Card actions" }));
	await user.click(await screen.findByRole("menuitem", { name: "Move to…" }));
	const dialog = await screen.findByRole("dialog");
	// The canvas the card is on is not offered as a place to send it.
	expect(within(dialog).queryByText("Board")).toBeNull();
	await user.click(within(dialog).getByText("Second board"));
	await waitFor(async () => {
		expect(
			parseNote(await host.readText(other.path)).note?.blocks.map((b) => b.id),
		).toEqual(["block", "item", "child"]);
		expect(parseNote(await host.readText(canvas.path)).note?.blocks).toEqual(
			[],
		);
	});
	expect((await moveNotice()).textContent).toContain('"Second board"');
	// Undo brings it back to the first canvas.
	await user.click(
		within(await moveNotice()).getByRole("button", { name: "Undo" }),
	);
	await waitFor(async () =>
		expect(
			parseNote(await host.readText(canvas.path)).note?.blocks[0]?.id,
		).toBe("block"),
	);
	expect(parseNote(await host.readText(other.path)).note?.blocks).toEqual([]);
});
