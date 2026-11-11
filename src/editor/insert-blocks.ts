import type { Editor, JSONContent } from "@tiptap/core";
import { Fragment } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";

/**
 * Put whole blocks into the note where the caret is: in place of the current
 * line when it is an empty paragraph at the top level, otherwise right after
 * the top-level block holding the caret. The caret ends up after the new
 * blocks. Nothing already written is changed.
 */
export function insertBlocksAtCaret(
	editor: Editor,
	nodes: JSONContent[],
): boolean {
	if (nodes.length === 0 || editor.isDestroyed) return false;
	const { state, view } = editor;
	const fragment = Fragment.fromArray(
		nodes.map((node) => state.schema.nodeFromJSON(node)),
	);
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
	const tr = state.tr.replaceWith(from, to, fragment);
	tr.setSelection(TextSelection.near(tr.doc.resolve(from + fragment.size), -1));
	view.dispatch(tr.scrollIntoView());
	view.focus();
	return true;
}
