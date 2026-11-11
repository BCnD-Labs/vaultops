import { type Editor, mergeAttributes, Node } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";

/**
 * The note's top node. It is the stock document plus `columns` and
 * `database`, which are allowed only here: not inside a column, a toggle, a
 * callout, a list, a quote, a table cell or a database row's page. That keeps
 * them from nesting by construction, and a hand-edited file that tries it
 * fails `checkBlocks` and opens read-only.
 */
export const Document = Node.create({
	name: "doc",
	topNode: true,
	content: "(block|columns|database)+",
});

/**
 * The top node of a database row's page, edited in the row page panel: any
 * blocks, but no columns and no database inside it.
 */
export const PageDocument = Node.create({
	name: "doc",
	topNode: true,
	content: "block+",
});

/** The most and fewest columns a layout holds. */
export const MIN_COLUMNS = 2;
export const MAX_COLUMNS = 3;

/**
 * A row of two or three equal columns. Stored as a container: a `columns` line
 * with a `column` line for each column, and each column's blocks as its child
 * lines. It has no attributes. It is never dragged or selected as a whole;
 * the blocks inside a column move like any other block.
 */
export const Columns = Node.create({
	name: "columns",
	content: `column{${MIN_COLUMNS},${MAX_COLUMNS}}`,
	defining: true,
	selectable: false,
	draggable: false,
	// Runs before the core Backspace handling.
	priority: 1000,

	parseHTML() {
		return [{ tag: 'div[data-type="columns"]' }];
	},

	renderHTML({ HTMLAttributes }) {
		return [
			"div",
			mergeAttributes(HTMLAttributes, { "data-type": "columns" }),
			0,
		];
	},

	addKeyboardShortcuts() {
		return {
			// Backspace at the start of a layout nobody has written in removes it,
			// leaving an empty line. A layout with anything in it stays.
			Backspace: () => {
				const { $from, empty } = this.editor.state.selection;
				if (!empty || $from.parentOffset !== 0 || $from.depth !== 3)
					return false;
				const columns = $from.node(1);
				if (columns.type.name !== this.name || !isEmptyLayout(columns))
					return false;
				if ($from.index(1) !== 0) return false;
				const { schema } = this.editor.state;
				const paragraph = schema.nodes.paragraph;
				if (!paragraph) return false;
				const at = $from.before(1);
				return this.editor
					.chain()
					.command(({ tr }) => {
						tr.replaceWith(at, at + columns.nodeSize, paragraph.create());
						tr.setSelection(TextSelection.create(tr.doc, at + 1));
						return true;
					})
					.run();
			},
		};
	},
});

/** One column of a `columns` block: any blocks, at least one. */
export const Column = Node.create({
	name: "column",
	content: "block+",
	// Backspace and Delete never join text across the edge of a column.
	isolating: true,
	defining: true,
	selectable: false,
	draggable: false,

	parseHTML() {
		return [{ tag: 'div[data-type="column"]' }];
	},

	renderHTML({ HTMLAttributes }) {
		return [
			"div",
			mergeAttributes(HTMLAttributes, { "data-type": "column" }),
			0,
		];
	},
});

/** Every column holds one empty paragraph. */
function isEmptyLayout(columns: ProseMirrorNode): boolean {
	let empty = true;
	columns.forEach((column) => {
		const only = column.childCount === 1 ? column.firstChild : null;
		if (only?.type.name !== "paragraph" || only.content.size > 0) empty = false;
	});
	return empty;
}

/**
 * Whether a layout can start where the cursor is: only on a line of the note
 * itself, not inside another block.
 */
export function canInsertColumns(editor: Editor): boolean {
	const { selection } = editor.state;
	return selection.$from.depth === 1 && selection.$from.parent.isTextblock;
}

/**
 * Put a layout of `count` empty columns in place of the line the slash was typed
 * on (or after it, if the line has other text), with the cursor in the first
 * column. Does nothing inside another block.
 */
export function insertColumns(
	editor: Editor,
	range: { from: number; to: number },
	count: number,
): boolean {
	if (count < MIN_COLUMNS || count > MAX_COLUMNS) return false;
	const { schema, doc } = editor.state;
	const columns = schema.nodes.columns;
	const column = schema.nodes.column;
	const paragraph = schema.nodes.paragraph;
	if (!columns || !column || !paragraph) return false;
	// Decide before changing anything: a refused insert must leave the note alone.
	const where = doc.resolve(range.from);
	if (where.depth !== 1 || !where.parent.isTextblock) return false;
	return editor
		.chain()
		.focus()
		.deleteRange(range)
		.command(({ tr }) => {
			const $from = tr.doc.resolve(range.from);
			const layout = columns.create(
				null,
				Array.from({ length: count }, () =>
					column.create(null, paragraph.create()),
				),
			);
			const blank = $from.parent.content.size === 0;
			const at = blank ? $from.before(1) : $from.after(1);
			if (blank) tr.replaceWith(at, $from.after(1), layout);
			else tr.insert(at, layout);
			// Inside the layout, its first column, and that column's paragraph.
			tr.setSelection(TextSelection.create(tr.doc, at + 3));
			return true;
		})
		.run();
}

/** Whether the document has a columns layout, so the drag handle can reach into it. */
export function hasColumns(doc: ProseMirrorNode): boolean {
	let found = false;
	doc.forEach((node) => {
		if (node.type.name === "columns") found = true;
	});
	return found;
}

/**
 * Drag handle rules for every note. The handle sits on the blocks of the note,
 * on the blocks directly in a column, and on each list item at any depth (so a
 * bullet can be dragged out of its parent item into the numbered list), but
 * never on a layout or a column itself, so those cannot be dragged. Returns the
 * amount taken off a node's score; 1000 rules it out.
 */
export const COLUMN_DRAG_RULES = [
	{
		id: "columnsStay",
		evaluate: ({
			node,
			parent,
		}: {
			node: ProseMirrorNode;
			parent: ProseMirrorNode | null;
		}): number => {
			const name = node.type.name;
			if (name === "columns" || name === "column") return 1000;
			if (name === "listItem") return 0;
			const holder = parent?.type.name;
			return holder === "doc" || holder === "column" ? 0 : 1000;
		},
	},
];
