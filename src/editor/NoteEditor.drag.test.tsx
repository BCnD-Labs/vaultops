// @vitest-environment happy-dom

import { cleanup, fireEvent, render } from "@testing-library/react";
import type { DragHandleProps } from "@tiptap/extension-drag-handle-react";
import { afterEach, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BLOCK_DRAG_TYPE } from "./block-drag";
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

afterEach(() => cleanup());

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
	expect(transfer.setDragImage).toHaveBeenCalledOnce();
	fireEvent.dragEnd(handle as Element, { dataTransfer: transfer });
	expect(document.querySelector(".block-drag-preview")).toBeNull();
});
