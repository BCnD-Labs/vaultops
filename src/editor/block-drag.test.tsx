// @vitest-environment happy-dom

import {
	cleanup,
	createEvent,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { getSchema, type JSONContent } from "@tiptap/core";
import { afterEach, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CanvasCard } from "../app/CanvasCard";
import { BLOCK_DRAG_TYPE, setBlockDragData } from "./block-drag";
import { BLOCK_TYPES } from "./blocks";
import { createExtensions } from "./extensions";
import { abandonLift } from "./lift";
import { NoteEditor } from "./NoteEditor";

const schema = getSchema(createExtensions());
const paragraph = (id: string, text: string): JSONContent => ({
	type: "paragraph",
	attrs: { id },
	content: [{ type: "text", text }],
});
const cellHeader: JSONContent = {
	type: "tableHeader",
	attrs: { id: "th" },
	content: [paragraph("thp", "Header cell")],
};
const cell: JSONContent = {
	type: "tableCell",
	attrs: { id: "td" },
	content: [paragraph("tdp", "Body cell")],
};
const headerRow: JSONContent = {
	type: "tableRow",
	attrs: { id: "tr1" },
	content: [cellHeader],
};
const bodyRow: JSONContent = {
	type: "tableRow",
	attrs: { id: "tr2" },
	content: [cell],
};
const table: JSONContent = {
	type: "table",
	attrs: { id: "table" },
	content: [headerRow, bodyRow],
};
const blocks: Record<(typeof BLOCK_TYPES)[number], JSONContent> = {
	table,
	tableRow: bodyRow,
	tableHeader: cellHeader,
	tableCell: cell,
	paragraph: paragraph("p", "Paragraph"),
	heading: {
		type: "heading",
		attrs: { id: "h", level: 1 },
		content: [{ type: "text", text: "Heading" }],
	},
	bulletList: {
		type: "bulletList",
		attrs: { id: "ul" },
		content: [
			{
				type: "listItem",
				attrs: { id: "li" },
				content: [paragraph("lip", "Bullet")],
			},
			{
				type: "listItem",
				attrs: { id: "li2" },
				content: [paragraph("lip2", "Second bullet")],
			},
		],
	},
	orderedList: {
		type: "orderedList",
		attrs: { id: "ol" },
		content: [
			{
				type: "listItem",
				attrs: { id: "oli" },
				content: [paragraph("olip", "Numbered")],
			},
		],
	},
	listItem: {
		type: "listItem",
		attrs: { id: "li" },
		content: [paragraph("lip", "Item")],
	},
	taskBlock: {
		type: "taskBlock",
		attrs: { id: "task" },
		content: [{ type: "text", text: "Task" }],
	},
	codeBlock: {
		type: "codeBlock",
		attrs: { id: "code" },
		content: [{ type: "text", text: "Code" }],
	},
	blockquote: {
		type: "blockquote",
		attrs: { id: "quote" },
		content: [paragraph("qp", "Quote")],
	},
	callout: {
		type: "callout",
		attrs: { id: "callout", tone: "info" },
		content: [paragraph("cp", "Callout")],
	},
	divider: { type: "divider", attrs: { id: "divider" } },
	toggle: {
		type: "toggle",
		attrs: { id: "toggle", open: true },
		content: [
			paragraph("ts", "Toggle summary"),
			paragraph("tb", "Toggle body"),
		],
	},
};

/** Blocks that are only ever reached through a top-level block that holds them. */
const HELD_BY: Partial<Record<(typeof BLOCK_TYPES)[number], JSONContent>> = {
	listItem: blocks.bulletList,
	tableRow: table,
	tableHeader: table,
	tableCell: table,
};

afterEach(() => {
	cleanup();
	abandonLift();
});

function dispatchDrag(
	type: "dragStart" | "dragOver" | "dragLeave" | "dragEnd" | "drop",
	target: Element | Document,
	dataTransfer: DataTransfer,
	clientY = 0,
) {
	const event = createEvent[type](target);
	Object.defineProperties(event, {
		dataTransfer: { value: dataTransfer },
		clientY: { value: clientY },
	});
	fireEvent(target, event);
}

it.each(BLOCK_TYPES)(
	"prepares a drag for %s with only identifiers and a readable first line",
	(type) => {
		const node = schema.nodeFromJSON(HELD_BY[type] ?? blocks[type]);
		const transfer = new DataTransfer();
		const firstLine = setBlockDragData(transfer, "note-1", node);
		expect(firstLine).toBe(transfer.getData("text/plain"));
		expect(firstLine).toBeTruthy();
		expect(transfer.effectAllowed).toBe("move");
		expect(JSON.parse(transfer.getData(BLOCK_DRAG_TYPE))).toEqual({
			noteId: "note-1",
			blockId: node.attrs.id,
		});
		expect(transfer.types).toHaveLength(2);
	},
);

it("uses only the first list item's line for a list preview", () => {
	const transfer = new DataTransfer();
	const node = schema.nodeFromJSON(blocks.bulletList);
	expect(setBlockDragData(transfer, "note-1", node)).toBe("Bullet");
});

it.each(BLOCK_TYPES)("renders the grip for %s", async (type) => {
	// A list item or table part is selected through its top-level wrapper.
	const root = HELD_BY[type] ?? blocks[type];
	render(
		<TooltipProvider>
			<NoteEditor
				doc={{ type: "doc", content: [root] }}
				noteId="note-1"
				onChange={() => {}}
			/>
		</TooltipProvider>,
	);
	await waitFor(() =>
		expect(document.querySelector(".block-drag-handle button")).not.toBeNull(),
	);
});

it("does not render the grip for a read-only note", () => {
	render(
		<TooltipProvider>
			<NoteEditor
				doc={{ type: "doc", content: [paragraph("p", "Hello")] }}
				noteId="note-1"
				editable={false}
				onChange={() => {}}
			/>
		</TooltipProvider>,
	);
	expect(document.querySelector(".block-drag-handle button")).toBeNull();
});

it("does not change a same-note document when the custom payload is dropped inside", () => {
	const onChange = vi.fn();
	const doc: JSONContent = {
		type: "doc",
		content: [paragraph("one", "First"), paragraph("two", "Second")],
	};
	const { container } = render(
		<TooltipProvider>
			<NoteEditor doc={doc} noteId="note-1" onChange={onChange} />
		</TooltipProvider>,
	);
	const editor = container.querySelector(".ProseMirror");
	expect(editor).not.toBeNull();
	const transfer = {
		getData: (type: string) =>
			type === BLOCK_DRAG_TYPE
				? JSON.stringify({ noteId: "note-1", blockId: "one" })
				: "",
		types: [BLOCK_DRAG_TYPE],
	};
	fireEvent.drop(editor as Element, { dataTransfer: transfer });
	expect(onChange).not.toHaveBeenCalled();
	expect(
		Array.from(editor?.querySelectorAll("[data-id]") ?? []).map((element) =>
			element.getAttribute("data-id"),
		),
	).toEqual(["one", "two"]);
	expect(() => schema.nodeFromJSON(doc).check()).not.toThrow();
});

it("sets effectAllowed to move and lifts the card on canvas card dragstart, and puts it down on dragend", async () => {
	const root = {
		id: "card-1",
		type: "paragraph" as const,
		parent: null,
		content: [{ type: "text", text: "Card body" }],
	};
	render(
		<CanvasCard
			root={root}
			blocks={[]}
			canvasId="canvas-1"
			draggable={true}
			onMoveToNote={() => {}}
		/>,
	);
	const card = screen
		.getByText("Card body")
		.closest(".canvas-card") as HTMLElement;
	const dataTransfer = new DataTransfer();
	const setDragImage = vi
		.spyOn(dataTransfer, "setDragImage")
		.mockImplementation(() => {});

	dispatchDrag("dragStart", card, dataTransfer);

	expect(dataTransfer.effectAllowed).toBe("move");
	expect(JSON.parse(dataTransfer.getData(BLOCK_DRAG_TYPE))).toEqual({
		noteId: "canvas-1",
		blockId: "card-1",
	});
	// The browser's own picture is blanked; the lifted card is drawn instead.
	expect(setDragImage).toHaveBeenCalledTimes(1);
	expect(setDragImage.mock.calls[0]?.[0]).toBeInstanceOf(HTMLDivElement);
	const ghost = document.querySelector(".lift-ghost") as HTMLElement;
	expect(ghost.classList.contains("lift-ghost--card")).toBe(true);
	expect(ghost.textContent).toContain("Card body");
	expect(ghost.querySelector(".canvas-menu")).toBeNull();
	expect(document.querySelector(".lift-hole")).not.toBeNull();

	dispatchDrag("dragEnd", card, dataTransfer);
	await waitFor(() => {
		expect(document.querySelector(".lift-ghost")).toBeNull();
		expect(document.querySelector(".lift-hole")).toBeNull();
	});
});

it("sets dropEffect to move on note dragover, shows the indicator at the right block index, and clears it on dragleave, dragend, and drop", async () => {
	const onDropBlock = vi.fn().mockResolvedValue(undefined);
	const doc = {
		type: "doc",
		content: [
			paragraph("first", "First block"),
			paragraph("second", "Second block"),
		],
	};
	render(
		<TooltipProvider>
			<NoteEditor
				doc={doc}
				noteId="note-1"
				editable={true}
				onChange={() => {}}
				onDropBlock={onDropBlock}
			/>
		</TooltipProvider>,
	);

	await waitFor(() => expect(screen.getByText("First block")).toBeTruthy());
	const dropArea = screen.getByRole("region", {
		name: "Note editor drop area",
	});
	const [firstBlock, secondBlock] = Array.from(
		dropArea.querySelector(".ProseMirror")?.children ?? [],
	) as HTMLElement[];
	if (!firstBlock || !secondBlock) throw new Error("missing blocks");

	vi.spyOn(dropArea, "getBoundingClientRect").mockReturnValue(
		new DOMRect(0, 100, 600, 300),
	);
	vi.spyOn(firstBlock, "getBoundingClientRect").mockReturnValue(
		new DOMRect(0, 110, 600, 40),
	);
	vi.spyOn(secondBlock, "getBoundingClientRect").mockReturnValue(
		new DOMRect(0, 170, 600, 40),
	);

	const makeTransfer = () => {
		const transfer = new DataTransfer();
		transfer.setData(
			BLOCK_DRAG_TYPE,
			JSON.stringify({ noteId: "canvas-1", blockId: "card-1" }),
		);
		return transfer;
	};
	const dropIndex = () =>
		screen.getByTestId("block-drop-indicator").getAttribute("data-drop-index");

	for (const [y, expected] of [
		[115, "0"],
		[160, "1"],
		[205, "2"],
	] as const) {
		const transfer = makeTransfer();
		dispatchDrag("dragOver", dropArea, transfer, y);
		expect(transfer.dropEffect).toBe("move");
		expect(dropIndex()).toBe(expected);
		// The gap is part of the page flow, between the blocks, not an overlay.
		expect(
			dropArea.querySelectorAll(".ProseMirror > .block-drop-slot"),
		).toHaveLength(1);
	}

	dispatchDrag("dragLeave", dropArea, makeTransfer());
	expect(screen.queryByTestId("block-drop-indicator")).toBeNull();

	dispatchDrag("dragOver", dropArea, makeTransfer(), 160);
	expect(dropIndex()).toBe("1");
	fireEvent.dragEnd(document);
	expect(screen.queryByTestId("block-drop-indicator")).toBeNull();

	dispatchDrag("dragOver", dropArea, makeTransfer(), 160);
	expect(dropIndex()).toBe("1");
	dispatchDrag("drop", dropArea, makeTransfer(), 160);
	expect(screen.queryByTestId("block-drop-indicator")).toBeNull();
	expect(onDropBlock).toHaveBeenCalledWith("card-1", "canvas-1", {
		after: "first",
		near: [],
		start: false,
	});
});
