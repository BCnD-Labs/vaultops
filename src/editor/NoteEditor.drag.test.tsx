// @vitest-environment happy-dom

import { cleanup, fireEvent, render } from "@testing-library/react";
import type { DragHandleProps } from "@tiptap/extension-drag-handle-react";
import { afterEach, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BLOCK_DRAG_TYPE } from "./block-drag";
import { abandonLift } from "./lift";
import { NoteEditor } from "./NoteEditor";

vi.mock("@tiptap/extension-drag-handle-react", () => ({
	default: (props: DragHandleProps) => {
		props.onNodeChange?.({
			node: props.editor.state.doc.firstChild,
			editor: props.editor,
			pos: 0,
		});
		return (
			<button
				type="button"
				className={props.className}
				draggable
				onDragStart={(event) => {
					props.onElementDragStart?.(event.nativeEvent);
					// The official extension clears the transfer after this callback.
					event.dataTransfer.clearData();
				}}
			>
				Drag
			</button>
		);
	},
}));

afterEach(() => {
	cleanup();
	abandonLift();
});

it("sets the VaultOps payload after the handle clears drag data", () => {
	render(
		<TooltipProvider>
			<NoteEditor
				noteId="note-1"
				doc={{
					type: "doc",
					content: [
						{
							type: "paragraph",
							attrs: { id: "block-1" },
							content: [{ type: "text", text: "First line" }],
						},
					],
				}}
				onChange={() => {}}
			/>
		</TooltipProvider>,
	);
	const transfer = new DataTransfer();
	transfer.setDragImage = vi.fn();
	const handle = document.querySelector(".block-drag-handle");
	expect(handle).not.toBeNull();
	fireEvent.dragStart(handle as Element, { dataTransfer: transfer });
	expect(JSON.parse(transfer.getData(BLOCK_DRAG_TYPE))).toEqual({
		noteId: "note-1",
		blockId: "block-1",
	});
	expect(transfer.getData("text/plain")).toBe("First line");
	// The browser's own picture is blanked; the lifted block is drawn instead.
	expect(transfer.setDragImage).toHaveBeenCalledOnce();
	expect(
		(transfer.setDragImage as ReturnType<typeof vi.fn>).mock.calls[0]?.[0],
	).toBeInstanceOf(HTMLDivElement);
	abandonLift();
	fireEvent.dragEnd(handle as Element, { dataTransfer: transfer });
	expect(document.querySelector(".lift-hole")).toBeNull();
});

it("drops a canvas block between root blocks and ignores other drags", () => {
	const onDropBlock = vi.fn().mockResolvedValue(undefined);
	render(
		<TooltipProvider>
			<NoteEditor
				noteId="note-1"
				doc={{
					type: "doc",
					content: ["first", "second"].map((id) => ({
						type: "paragraph",
						attrs: { id },
						content: [{ type: "text", text: id }],
					})),
				}}
				onChange={() => {}}
				onDropBlock={onDropBlock}
			/>
		</TooltipProvider>,
	);
	const roots = document.querySelectorAll(".ProseMirror > p");
	expect(roots).toHaveLength(2);
	vi.spyOn(roots[0] as Element, "getBoundingClientRect").mockReturnValue({
		top: 0,
		height: 20,
	} as DOMRect);
	vi.spyOn(roots[1] as Element, "getBoundingClientRect").mockReturnValue({
		top: 20,
		height: 20,
	} as DOMRect);
	const target = document.querySelector(".note-editor") as Element;
	const transfer = new DataTransfer();
	transfer.setData(
		BLOCK_DRAG_TYPE,
		JSON.stringify({ noteId: "canvas", blockId: "card" }),
	);
	const drop = new Event("drop", { bubbles: true, cancelable: true });
	Object.defineProperty(drop, "dataTransfer", { value: transfer });
	Object.defineProperty(drop, "clientY", { value: 19 });
	fireEvent(target, drop);
	expect(onDropBlock).toHaveBeenCalledWith("card", "canvas", {
		after: "first",
		near: [],
		start: false,
	});
	const top = new Event("drop", { bubbles: true, cancelable: true });
	Object.defineProperty(top, "dataTransfer", { value: transfer });
	Object.defineProperty(top, "clientY", { value: 2 });
	fireEvent(target, top);
	expect(onDropBlock).toHaveBeenLastCalledWith("card", "canvas", {
		after: null,
		near: [],
		start: true,
	});
	const bottom = new Event("drop", { bubbles: true, cancelable: true });
	Object.defineProperty(bottom, "dataTransfer", { value: transfer });
	Object.defineProperty(bottom, "clientY", { value: 39 });
	fireEvent(target, bottom);
	expect(onDropBlock).toHaveBeenLastCalledWith("card", "canvas", {
		after: "second",
		near: ["first"],
		start: false,
	});
	onDropBlock.mockClear();
	transfer.setData(
		BLOCK_DRAG_TYPE,
		JSON.stringify({ noteId: "note-1", blockId: "first" }),
	);
	fireEvent(target, drop);
	expect(onDropBlock).toHaveBeenCalledTimes(0);
	fireEvent.drop(target, { dataTransfer: new DataTransfer(), clientY: 19 });
	expect(onDropBlock).toHaveBeenCalledTimes(0);
});
