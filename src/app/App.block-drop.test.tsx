// @vitest-environment happy-dom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import type { JSONContent } from "@tiptap/core";
import { type DragEvent, useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { parseNote } from "../core/note-format";
import { createCanvas, createNote } from "../core/notes/repository";
import { BLOCK_DRAG_TYPE } from "../editor/block-drag";
import { MemoryHost } from "../host/memory-host";
import { App } from "./App";
import { loadVault } from "./session";

let dragNoteId = "";

vi.mock("../editor/NoteEditor", () => ({
	NoteEditor: ({
		doc,
		onChange,
	}: {
		doc: JSONContent;
		onChange: (doc: JSONContent) => void;
	}) => {
		const [initial] = useState(doc);
		return (
			<div>
				<output data-testid="editor-blocks">{JSON.stringify(initial)}</output>
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
	fireEvent.click(screen.getByTitle("Board.vnote"));
	await screen.findByRole("region", { name: "Canvas view" });
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
	fireEvent.click(screen.getByRole("button", { name: "Close canvas" }));
	cleanup();
	localStorage.clear();
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

it("keeps both copies visible and names both files after a failed source write", async () => {
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
		expect(alert.textContent).toContain(canvas.path);
		expect(alert.textContent).toContain(note.path);
	});
	expect(parseNote(await host.readText(note.path)).note?.blocks[0]?.id).toBe(
		"block",
	);
	expect(parseNote(await host.readText(canvas.path)).note?.blocks[0]?.id).toBe(
		"block",
	);
	expect(
		within(screen.getByRole("region", { name: "Canvas view" })).getByText(
			"Move me",
		),
	).toBeTruthy();
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
