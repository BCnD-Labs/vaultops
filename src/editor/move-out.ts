import { type Editor, Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";

/** Blocks that hold other blocks, with the word used on the button. */
const CONTAINERS: Record<string, string> = {
	listItem: "list",
	blockquote: "quote",
	callout: "callout",
	toggle: "toggle",
	column: "column",
};

/** Blocks a dragged block can end up inside, for the "Nest in …" label. */
const NEST_LABELS: Record<string, string> = {
	...CONTAINERS,
	tableCell: "table cell",
	tableHeader: "table cell",
};

/** The label for dropping inside a block of this type, or null if it is not a container. */
export function nestLabel(typeName: string): string | null {
	return NEST_LABELS[typeName] ?? null;
}

export interface Movable {
	/** Position just before the block that can leave its container. */
	pos: number;
	node: ProseMirrorNode;
	/** "list", "quote", "callout", "toggle" or "column". */
	from: string;
}

/**
 * The block at `pos` (or the nearest one around it) that sits inside another
 * block and may be moved out of it. A list item's own text and a toggle's title
 * stay where they are, and so do the only block in a quote or callout and a list
 * nested in a list (Shift+Tab already outdents it).
 */
export function findMovable(doc: ProseMirrorNode, pos: number): Movable | null {
	if (pos < 0 || pos > doc.content.size) return null;
	const $pos = doc.resolve(pos);
	for (let depth = $pos.depth; depth >= 2; depth--) {
		const parent = $pos.node(depth - 1);
		const from = CONTAINERS[parent.type.name];
		if (!from) continue;
		const node = $pos.node(depth);
		const index = $pos.index(depth - 1);
		const leads =
			parent.type.name === "listItem" || parent.type.name === "toggle";
		if (leads && index === 0) continue;
		if (
			parent.type.name === "listItem" &&
			(node.type.name === "bulletList" || node.type.name === "orderedList")
		)
			continue;
		if (!leads && parent.childCount < 2) continue;
		return { pos: $pos.before(depth), node, from };
	}
	return null;
}

/** Move the block out of its container to just below the outermost block it is in. */
export function moveOut(editor: Editor, pos: number): boolean {
	const found = findMovable(editor.state.doc, pos + 1);
	if (!found || found.pos !== pos) return false;
	const { state } = editor;
	const $start = state.doc.resolve(found.pos);
	const end = found.pos + found.node.nodeSize;
	const rootEnd = $start.after(1);
	const tr = state.tr;
	tr.insert(rootEnd, found.node);
	tr.delete(found.pos, end);
	const landed = rootEnd - found.node.nodeSize;
	tr.setSelection(TextSelection.near(tr.doc.resolve(landed + 1)));
	editor.view.dispatch(tr.scrollIntoView());
	editor.commands.focus();
	return true;
}

/** Cmd/Ctrl+Alt+Left takes the block at the cursor out of the block holding it. */
export const MoveOut = Extension.create({
	name: "moveOut",
	addKeyboardShortcuts() {
		return {
			"Mod-Alt-ArrowLeft": ({ editor }) => {
				const found = findMovable(
					editor.state.doc,
					editor.state.selection.from,
				);
				return found ? moveOut(editor, found.pos) : false;
			},
		};
	},
});
