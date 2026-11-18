import type { Editor, JSONContent } from "@tiptap/core";
import { Fragment, type Node, Slice } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";

export type TemplateCursor = { blockId: string; offset: number };

export function templateCaret(
	doc: Node,
	cursor: TemplateCursor | null,
	end: number,
) {
	let at: number | undefined;
	if (cursor)
		doc.descendants((node, pos) => {
			if (at !== undefined) return false;
			if (node.attrs.id !== cursor.blockId || !node.isTextblock) return true;
			let remaining = cursor.offset;
			node.forEach((child, offset) => {
				if (at !== undefined || !child.isText) return;
				const length = child.text?.length ?? 0;
				if (remaining <= length) at = pos + 1 + offset + remaining;
				else remaining -= length;
			});
			at ??= pos + node.nodeSize - 1;
			return false;
		});
	return TextSelection.near(doc.resolve(at ?? end), -1);
}

/**
 * Put whole blocks into the note where the caret is: in place of the current
 * line when it is an empty paragraph at the top level, otherwise right after
 * the top-level block holding the caret. A template can replace a captured
 * selection and specify a caret within the inserted blocks.
 */
export function insertBlocksAtCaret(
	editor: Editor,
	nodes: JSONContent[],
	cursor: TemplateCursor | null = null,
	selection?: { from: number; to: number },
): boolean {
	if (nodes.length === 0 || editor.isDestroyed) return false;
	const { state, view } = editor;
	const fragment = Fragment.fromArray(
		nodes.map((node) => state.schema.nodeFromJSON(node)),
	);
	const tr = state.tr;
	const { $from } = state.selection;
	const emptyLine =
		$from.depth === 1 &&
		$from.parent.type.name === "paragraph" &&
		$from.parent.content.size === 0;
	const from =
		$from.depth >= 1
			? emptyLine
				? $from.before(1)
				: $from.after(1)
			: $from.pos;
	const to = emptyLine ? $from.after(1) : from;
	let end = from + fragment.size;
	if (selection && selection.from !== selection.to) {
		tr.replaceRange(selection.from, selection.to, new Slice(fragment, 0, 0));
		end = tr.mapping.map(selection.to, 1);
	} else tr.replaceWith(from, to, fragment);
	tr.setSelection(templateCaret(tr.doc, cursor, end));
	view.dispatch(tr.scrollIntoView());
	view.focus();
	return true;
}
