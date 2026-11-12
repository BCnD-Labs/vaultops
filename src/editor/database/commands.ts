import type { Editor, JSONContent } from "@tiptap/core";
import { Fragment, type Node as PMNode } from "@tiptap/pm/model";
import { TextSelection, type Transaction } from "@tiptap/pm/state";
import {
	type Cells,
	type CellValue,
	COLUMN_TYPE_LABELS,
	type ColumnType,
	clampWidth,
	convertColumn,
	type DbColumn,
	type DbSort,
	hasOptions,
	newShortId,
	normalizeCells,
	normalizeColumns,
	normalizeNoteId,
	normalizeSort,
	PICKABLE_TYPES,
	starterColumns,
	starterStatusOptions,
	TITLE_ID,
} from "./model";

/**
 * Every change the database view makes, each as one transaction (one undo
 * step). A database is found by its position, which the node view gets from
 * ProseMirror on each call; a row is found by its id, so the row page panel
 * still finds its row after other edits moved it.
 */

export const DATABASE = "database";
export const DATABASE_ROW = "databaseRow";

export interface DatabaseState {
	columns: DbColumn[];
	sort: DbSort | null;
	title: string;
	rows: {
		id: string;
		cells: Cells;
		/** The note this row was turned into, or null. */
		noteId: string | null;
		node: PMNode;
		pos: number;
	}[];
}

/** The database at `pos`, read through the normalizers, or null if it moved. */
export function readDatabase(doc: PMNode, pos: number): DatabaseState | null {
	const node = doc.nodeAt(pos);
	if (!node || node.type.name !== DATABASE) return null;
	return databaseFromNode(node, pos);
}

/** A database node's state; `pos` is only used for the rows' positions. */
export function databaseFromNode(node: PMNode, pos: number): DatabaseState {
	const columns = normalizeColumns(node.attrs.columns);
	const rows: DatabaseState["rows"] = [];
	node.forEach((child, offset) => {
		if (child.type.name !== DATABASE_ROW) return;
		rows.push({
			id: typeof child.attrs.id === "string" ? child.attrs.id : "",
			cells: normalizeCells(child.attrs.cells),
			noteId: normalizeNoteId(child.attrs.noteId),
			node: child,
			pos: pos + 1 + offset,
		});
	});
	return {
		columns,
		sort: normalizeSort(node.attrs.sort, columns),
		title: typeof node.attrs.title === "string" ? node.attrs.title : "",
		rows,
	};
}

/** Where a row is now, and the database holding it. */
export function findRow(
	doc: PMNode,
	rowId: string,
): { node: PMNode; pos: number; dbPos: number } | null {
	let found: { node: PMNode; pos: number; dbPos: number } | null = null;
	doc.descendants((node, pos, parent) => {
		if (found) return false;
		if (node.type.name === DATABASE_ROW && node.attrs.id === rowId) {
			const dbPos = doc.resolve(pos).before();
			if (parent?.type.name === DATABASE) found = { node, pos, dbPos };
			return false;
		}
		// Rows only live directly inside databases, which only live at the top.
		return node.type.name === DATABASE || node.type.name === "doc";
	});
	return found;
}

function apply(editor: Editor, build: (tr: Transaction) => boolean): boolean {
	if (!editor.isEditable) return false;
	const tr = editor.state.tr;
	if (!build(tr)) return false;
	editor.view.dispatch(tr);
	return true;
}

function setDbAttrs(
	tr: Transaction,
	pos: number,
	attrs: Record<string, unknown>,
): boolean {
	const node = tr.doc.nodeAt(pos);
	if (!node || node.type.name !== DATABASE) return false;
	tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...attrs });
	return true;
}

export function setTitle(editor: Editor, pos: number, title: string): boolean {
	return apply(editor, (tr) => setDbAttrs(tr, pos, { title }));
}

export function setSort(
	editor: Editor,
	pos: number,
	sort: DbSort | null,
): boolean {
	return apply(editor, (tr) => setDbAttrs(tr, pos, { sort }));
}

/** Adds an empty row at the end (or `index`) and returns its id. */
export function addRow(
	editor: Editor,
	pos: number,
	cells: Cells = {},
	index?: number,
): string | null {
	const id = crypto.randomUUID();
	const ok = apply(editor, (tr) => {
		const db = readDatabase(tr.doc, pos);
		const type = editor.schema.nodes[DATABASE_ROW];
		const node = tr.doc.nodeAt(pos);
		if (!db || !type || !node) return false;
		const at =
			index !== undefined && index < db.rows.length
				? (db.rows[Math.max(0, index)]?.pos ?? pos + node.nodeSize - 1)
				: pos + node.nodeSize - 1;
		tr.insert(at, type.create({ id, cells }));
		return true;
	});
	return ok ? id : null;
}

export function deleteRow(editor: Editor, rowId: string): boolean {
	return apply(editor, (tr) => {
		const row = findRow(tr.doc, rowId);
		if (!row) return false;
		tr.delete(row.pos, row.pos + row.node.nodeSize);
		return true;
	});
}

/** Sets one cell; `null` (or an empty value) removes it from the row. */
export function setCell(
	editor: Editor,
	rowId: string,
	columnId: string,
	value: CellValue,
): boolean {
	return apply(editor, (tr) => {
		const row = findRow(tr.doc, rowId);
		if (!row) return false;
		const cells = { ...normalizeCells(row.node.attrs.cells) };
		const empty =
			value === null ||
			value === "" ||
			value === false ||
			(Array.isArray(value) && value.length === 0);
		if (empty) delete cells[columnId];
		else cells[columnId] = value;
		tr.setNodeMarkup(row.pos, undefined, { ...row.node.attrs, cells });
		return true;
	});
}

/** A page of one empty paragraph is no page: the blocks that count. */
export function pageBlocks(content: JSONContent[]): JSONContent[] {
	const blank =
		content.length === 1 &&
		content[0]?.type === "paragraph" &&
		!content[0].content?.length;
	return blank ? [] : content;
}

/** The note a row was turned into, or null (also null if the row is gone). */
export function rowNoteId(editor: Editor, rowId: string): string | null {
	const row = findRow(editor.state.doc, rowId);
	return row ? normalizeNoteId(row.node.attrs.noteId) : null;
}

/**
 * Replaces a row's page (its child blocks) with the given blocks, as the row
 * page panel's own editor holds them. One empty paragraph counts as no page.
 * A row that is a note has no page of its own, so this never writes to it.
 */
export function setRowContent(
	editor: Editor,
	rowId: string,
	content: JSONContent[],
): boolean {
	const blocks = pageBlocks(content);
	return apply(editor, (tr) => {
		const row = findRow(tr.doc, rowId);
		if (!row || normalizeNoteId(row.node.attrs.noteId)) return false;
		const nodes = blocks.map((json) => editor.schema.nodeFromJSON(json));
		const fragment = Fragment.fromArray(nodes);
		if (fragment.eq(row.node.content)) return false;
		tr.replaceWith(row.pos + 1, row.pos + row.node.nodeSize - 1, fragment);
		return true;
	});
}

export type LinkRowResult =
	| "linked"
	| "not-editable"
	| "row-gone"
	| "already-a-note"
	| "page-changed";

/**
 * Makes a row the note `noteId`: the row keeps its place and cells, remembers
 * the note, and gives up its page blocks (the note now holds them). `copied`
 * is the page as it was copied into the note; if the row's page is anything
 * else by now (typed in while the note was being made) nothing changes, so no
 * typing is ever dropped. One undo step: undoing it gives the row its page
 * back and forgets the link; the note stays, as a note of its own. Either way
 * the page is somewhere, and the row never points at a note that wasn't made.
 */
export function linkRowToNote(
	editor: Editor,
	rowId: string,
	noteId: string,
	copied: JSONContent[],
): LinkRowResult {
	if (!editor.isEditable) return "not-editable";
	const tr = editor.state.tr;
	const row = findRow(tr.doc, rowId);
	if (!row) return "row-gone";
	if (normalizeNoteId(row.node.attrs.noteId)) return "already-a-note";
	const page = Fragment.fromArray(
		pageBlocks(copied).map((json) => editor.schema.nodeFromJSON(json)),
	);
	if (!page.eq(row.node.content)) return "page-changed";
	tr.replaceWith(row.pos + 1, row.pos + row.node.nodeSize - 1, Fragment.empty);
	tr.setNodeMarkup(row.pos, undefined, { ...row.node.attrs, noteId });
	editor.view.dispatch(tr);
	return "linked";
}

/** Forgets the note a row was turned into. The note itself is left alone. */
export function unlinkRow(editor: Editor, rowId: string): boolean {
	return apply(editor, (tr) => {
		const row = findRow(tr.doc, rowId);
		if (!row || !normalizeNoteId(row.node.attrs.noteId)) return false;
		tr.setNodeMarkup(row.pos, undefined, { ...row.node.attrs, noteId: null });
		return true;
	});
}

/** Changes the columns and, in the same step, any row cells given. */
function writeColumns(
	tr: Transaction,
	pos: number,
	columns: DbColumn[],
	cellUpdates?: Map<number, Cells>,
	sort?: DbSort | null,
): boolean {
	const db = readDatabase(tr.doc, pos);
	if (!db) return false;
	if (cellUpdates) {
		for (const row of db.rows) {
			const index = db.rows.indexOf(row);
			const cells = cellUpdates.get(index);
			if (!cells) continue;
			// Row positions don't shift: only attributes change.
			tr.setNodeMarkup(row.pos, undefined, { ...row.node.attrs, cells });
		}
	}
	const attrs: Record<string, unknown> = { columns };
	if (sort !== undefined) attrs.sort = sort;
	return setDbAttrs(tr, pos, attrs);
}

/** Adds a column of `type` at the end and returns its id. */
export function addColumn(
	editor: Editor,
	pos: number,
	type: ColumnType = "text",
): string | null {
	let id: string | null = null;
	const ok = apply(editor, (tr) => {
		const db = readDatabase(tr.doc, pos);
		if (
			!db ||
			!PICKABLE_TYPES.includes(type as (typeof PICKABLE_TYPES)[number])
		)
			return false;
		id = newShortId(db.columns.map((c) => c.id));
		const base = COLUMN_TYPE_LABELS[type];
		const names = new Set(db.columns.map((c) => c.name));
		let name = base;
		for (let n = 2; names.has(name); n++) name = `${base} ${n}`;
		const column: DbColumn = { id, name, type };
		if (type === "status") column.options = starterStatusOptions();
		else if (hasOptions(type)) column.options = [];
		return writeColumns(tr, pos, [...db.columns, column]);
	});
	return ok ? id : null;
}

/** Renames, resizes or replaces the options of a column. */
export function updateColumn(
	editor: Editor,
	pos: number,
	columnId: string,
	patch: Partial<Pick<DbColumn, "name" | "width" | "options">>,
): boolean {
	return apply(editor, (tr) => {
		const db = readDatabase(tr.doc, pos);
		if (!db) return false;
		const columns = db.columns.map((c) => {
			if (c.id !== columnId) return c;
			const next = { ...c, ...patch };
			if (next.width !== undefined) next.width = clampWidth(next.width);
			return next;
		});
		return writeColumns(tr, pos, columns);
	});
}

/** Deletes a column and its values in every row. The title column stays. */
export function deleteColumn(
	editor: Editor,
	pos: number,
	columnId: string,
): boolean {
	if (columnId === TITLE_ID) return false;
	return apply(editor, (tr) => {
		const db = readDatabase(tr.doc, pos);
		if (!db?.columns.some((c) => c.id === columnId)) return false;
		const updates = new Map<number, Cells>();
		db.rows.forEach((row, i) => {
			if (!(columnId in row.cells)) return;
			const { [columnId]: _gone, ...rest } = row.cells;
			updates.set(i, rest);
		});
		const sort = db.sort?.column === columnId ? null : undefined;
		return writeColumns(
			tr,
			pos,
			db.columns.filter((c) => c.id !== columnId),
			updates,
			sort,
		);
	});
}

/** Moves a column one place left (-1) or right (+1). The title stays first. */
export function moveColumn(
	editor: Editor,
	pos: number,
	columnId: string,
	delta: -1 | 1,
): boolean {
	return apply(editor, (tr) => {
		const db = readDatabase(tr.doc, pos);
		if (!db) return false;
		const from = db.columns.findIndex((c) => c.id === columnId);
		const to = from + delta;
		if (from < 1 || to < 1 || to >= db.columns.length) return false;
		const columns = [...db.columns];
		const [moved] = columns.splice(from, 1);
		if (!moved) return false;
		columns.splice(to, 0, moved);
		return writeColumns(tr, pos, columns);
	});
}

/** Changes a column's type, carrying each row's value over (see convertColumn). */
export function changeColumnType(
	editor: Editor,
	pos: number,
	columnId: string,
	type: ColumnType,
): boolean {
	return apply(editor, (tr) => {
		const db = readDatabase(tr.doc, pos);
		const column = db?.columns.find((c) => c.id === columnId);
		if (!db || !column || column.type === type) return false;
		if (column.type === "title" || type === "title") return false;
		const { column: next, values } = convertColumn(
			column,
			type,
			db.rows.map((r) => r.cells),
		);
		const updates = new Map<number, Cells>();
		db.rows.forEach((row, i) => {
			const value = values[i] ?? null;
			const cells = { ...row.cells };
			const empty =
				value === null ||
				value === false ||
				(Array.isArray(value) && value.length === 0);
			if (empty) delete cells[columnId];
			else cells[columnId] = value;
			updates.set(i, cells);
		});
		return writeColumns(
			tr,
			pos,
			db.columns.map((c) => (c.id === columnId ? next : c)),
			updates,
		);
	});
}

/**
 * Sets a select or multi-select cell and, in the same step, the column's
 * options (when the user typed a new option name).
 */
export function setOptionCell(
	editor: Editor,
	pos: number,
	rowId: string,
	column: DbColumn,
	value: CellValue,
): boolean {
	return apply(editor, (tr) => {
		const db = readDatabase(tr.doc, pos);
		const row = findRow(tr.doc, rowId);
		if (!db || !row) return false;
		const columns = db.columns.map((c) => (c.id === column.id ? column : c));
		if (!setDbAttrs(tr, pos, { columns })) return false;
		const cells = { ...normalizeCells(row.node.attrs.cells) };
		const empty =
			value === null || (Array.isArray(value) && value.length === 0);
		if (empty) delete cells[column.id];
		else cells[column.id] = value;
		const moved = tr.doc.nodeAt(row.pos);
		if (!moved) return false;
		tr.setNodeMarkup(row.pos, undefined, { ...moved.attrs, cells });
		return true;
	});
}

/**
 * Inserts a new database (Name and Tags columns, three empty rows) in place
 * of the slash command's text. Like columns it only goes at the top of a
 * note: from inside a list, quote or column it does nothing. A blank line is
 * replaced; otherwise the database goes after the current line. An empty line
 * follows it when it would end the note, so there is always a place to type.
 */
export function insertDatabase(
	editor: Editor,
	range: { from: number; to: number },
): boolean {
	const { schema, doc } = editor.state;
	const database = schema.nodes[DATABASE];
	const row = schema.nodes[DATABASE_ROW];
	const paragraph = schema.nodes.paragraph;
	if (!database || !row || !paragraph) return false;
	const where = doc.resolve(range.from);
	if (where.depth !== 1 || !where.parent.isTextblock) return false;
	return editor
		.chain()
		.focus()
		.deleteRange(range)
		.command(({ tr }) => {
			const $from = tr.doc.resolve(range.from);
			const node = database.create(
				{ columns: starterColumns() },
				[0, 1, 2].map(() => row.create({ id: crypto.randomUUID(), cells: {} })),
			);
			const blank = $from.parent.content.size === 0;
			const at = blank ? $from.before(1) : $from.after(1);
			if (blank) tr.replaceWith(at, $from.after(1), node);
			else tr.insert(at, node);
			const after = at + node.nodeSize;
			if (after >= tr.doc.content.size) tr.insert(after, paragraph.create());
			tr.setSelection(TextSelection.create(tr.doc, after + 1));
			return true;
		})
		.run();
}
