// @vitest-environment happy-dom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { type Note, serializeNote } from "../core/note-format";
import { MemoryHost } from "../host/memory-host";
import { createLiveDocuments } from "./live-documents";
import { NoteCanvasFrame } from "./NoteCanvasFrame";

afterEach(cleanup);

it("edits the shared canvas and shows a placeholder when the frame is removed", async () => {
	const host = new MemoryHost();
	const path = "Board.vnote";
	const note: Note = {
		header: {
			format: "vaultops-note",
			v: 1,
			noteId: "board",
			title: "Board",
			kind: "canvas",
		},
		blocks: [
			{
				id: "frame",
				type: "group",
				parent: null,
				attrs: { members: ["sticky"] },
			},
			{
				id: "sticky",
				type: "sticky",
				parent: null,
				content: [{ type: "text", text: "Before" }],
			},
			{
				id: "outside",
				type: "label",
				parent: null,
				content: [{ type: "text", text: "Outside" }],
			},
		],
	};
	await host.writeTextAtomic(path, serializeNote(note));
	const documents = createLiveDocuments(host, {
		notes: [{ path, id: "board", readOnly: false }],
		writable: true,
	});
	const pane = documents.subscribePassive({ path }, () => {});
	await pane.ready;
	render(
		<NoteCanvasFrame
			documents={documents}
			canvasId="board"
			groupId="frame"
			editable
		/>,
	);
	fireEvent.doubleClick(await screen.findByText("Before"));
	const input = screen.getByRole("textbox", { name: "Text of sticky" });
	fireEvent.change(input, { target: { value: "After" } });
	fireEvent.blur(input);
	await screen.findByText("After");
	expect(screen.queryByText("Outside")).toBeNull();
	expect(pane.current()?.draft?.blocks[1]?.content).toEqual([
		{ type: "text", text: "After" },
	]);
	expect(pane.current()?.draft?.blocks[2]).toEqual(note.blocks[2]);
	await pane.editCanvas(
		(blocks) => blocks.filter((block) => block.id !== "frame"),
		"removing frame",
	);
	await waitFor(() =>
		expect(screen.getByText("Frame unavailable")).toBeTruthy(),
	);
	pane.unsubscribe();
});
