import type { Editor } from "@tiptap/core";
import { Selection } from "@tiptap/pm/state";

/** The table node that holds this DOM element's content, as its document position. */
export function tablePosOf(editor: Editor, element: Element): number | null {
	const { view } = editor;
	try {
		const body = element.querySelector("tbody") ?? element;
		const $pos = view.state.doc.resolve(view.posAtDOM(body, 0));
		for (let depth = $pos.depth; depth > 0; depth--) {
			if ($pos.node(depth).type.name === "table") return $pos.before(depth);
		}
	} catch {
		/* An element the editor does not know (or has since removed). */
	}
	return null;
}

/** Put the caret in the first valid spot inside the node that starts at `pos`. */
function caretInside(editor: Editor, pos: number): Selection {
	return Selection.near(editor.state.doc.resolve(pos + 1), 1);
}

/** Start of the cell at `column` in the row at `row` of the table at `tablePos`. */
function cellPos(
	editor: Editor,
	tablePos: number,
	row: number,
	column: "first" | "last",
): number | null {
	const table = editor.state.doc.nodeAt(tablePos);
	if (table?.type.name !== "table" || table.childCount === 0) return null;
	let pos = tablePos + 1;
	for (let r = 0; r < row; r++) pos += table.child(r).nodeSize;
	const rowNode = table.child(row);
	if (rowNode.childCount === 0) return null;
	pos += 1;
	if (column === "last") {
		for (let c = 0; c < rowNode.childCount - 1; c++)
			pos += rowNode.child(c).nodeSize;
	}
	return pos;
}

function atCell(editor: Editor, pos: number | null) {
	if (pos === null) return null;
	const selection = caretInside(editor, pos);
	return editor.chain().command(({ tr }) => {
		tr.setSelection(selection);
		return true;
	});
}

/** A new empty column after the last one (the caret goes to the last column first). */
export function addColumnAtEnd(editor: Editor, tablePos: number): boolean {
	const chain = atCell(editor, cellPos(editor, tablePos, 0, "last"));
	return chain ? chain.addColumnAfter().focus().run() : false;
}

/** A new empty row after the last one (the caret goes to the last row first). */
export function addRowAtEnd(editor: Editor, tablePos: number): boolean {
	const table = editor.state.doc.nodeAt(tablePos);
	if (!table) return false;
	const chain = atCell(
		editor,
		cellPos(editor, tablePos, table.childCount - 1, "first"),
	);
	return chain ? chain.addRowAfter().focus().run() : false;
}

export interface TableMenuAction {
	id: string;
	label: string;
	/** True when the action works with the caret where it is. */
	can: (editor: Editor) => boolean;
	run: (editor: Editor) => void;
	danger?: boolean;
}

/** The right-click menu for a table cell, in order; a separator follows an action marked `after`. */
export const TABLE_MENU_ACTIONS: (TableMenuAction & { after?: boolean })[] = [
	{
		id: "row-above",
		label: "Insert row above",
		can: (e) => e.can().addRowBefore(),
		run: (e) => void e.chain().focus().addRowBefore().run(),
	},
	{
		id: "row-below",
		label: "Insert row below",
		can: (e) => e.can().addRowAfter(),
		run: (e) => void e.chain().focus().addRowAfter().run(),
	},
	{
		id: "column-left",
		label: "Insert column left",
		can: (e) => e.can().addColumnBefore(),
		run: (e) => void e.chain().focus().addColumnBefore().run(),
	},
	{
		id: "column-right",
		label: "Insert column right",
		can: (e) => e.can().addColumnAfter(),
		run: (e) => void e.chain().focus().addColumnAfter().run(),
		after: true,
	},
	{
		id: "delete-row",
		label: "Delete row",
		can: (e) => e.can().deleteRow(),
		run: (e) => void e.chain().focus().deleteRow().run(),
	},
	{
		id: "delete-column",
		label: "Delete column",
		can: (e) => e.can().deleteColumn(),
		run: (e) => void e.chain().focus().deleteColumn().run(),
	},
	{
		id: "toggle-header",
		label: "Toggle header row",
		can: (e) => e.can().toggleHeaderRow(),
		run: (e) => void e.chain().focus().toggleHeaderRow().run(),
		after: true,
	},
	{
		id: "delete-table",
		label: "Delete table",
		can: (e) => e.can().deleteTable(),
		run: (e) => void e.chain().focus().deleteTable().run(),
		danger: true,
	},
];
