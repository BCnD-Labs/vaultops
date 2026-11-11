import { Extension, InputRule } from "@tiptap/core";
import { Fragment, type Node as PMNode } from "@tiptap/pm/model";
import {
	type EditorState,
	TextSelection,
	type Transaction,
} from "@tiptap/pm/state";

type ListName = "bulletList" | "orderedList";
const LISTS = new Set<string>(["bulletList", "orderedList"]);

/** The nearest list around a position, with where it starts. */
function listAround(
	state: EditorState | Transaction,
	pos: number,
): { node: PMNode; pos: number } | null {
	const $pos = state.doc.resolve(pos);
	for (let depth = $pos.depth; depth > 0; depth--) {
		const node = $pos.node(depth);
		if (LISTS.has(node.type.name)) return { node, pos: $pos.before(depth) };
	}
	return null;
}

/** Turn the list around the selection into `target`, keeping its id. */
function retype(tr: Transaction, target: ListName): boolean {
	const list = listAround(tr, tr.selection.from);
	if (!list) return false;
	if (list.node.type.name === target) return true;
	const type = tr.doc.type.schema.nodes[target];
	if (!type) return false;
	tr.setNodeMarkup(list.pos, type, { id: list.node.attrs.id });
	return true;
}

/**
 * Typing a list marker at the start of a list item, Workflowy style:
 * `- ` or `* ` makes bullets and `1. ` makes numbers. On any item but the
 * first, the item moves in one level under the item above, in a list of that
 * kind (so `1. urban centers` then `- dense populations` nests a bullet under
 * the number). On the first item, where there is nothing to nest under, the
 * list itself switches kind; typing the kind it already is leaves the text.
 *
 * StarterKit's own list rules only start a new list, and do nothing inside a
 * list item's first line, which is why this rule exists.
 */
function markerRule(find: RegExp, target: ListName) {
	return new InputRule({
		find,
		handler: ({ state, range, chain }) => {
			const $from = state.doc.resolve(range.from);
			if ($from.depth < 3) return null;
			if ($from.parent.type.name !== "paragraph") return null;
			if (range.from !== $from.start()) return null;
			const item = $from.node(-1);
			if (item.type.name !== "listItem" || $from.index(-1) !== 0) return null;
			const list = $from.node(-2);
			const first = $from.index(-2) === 0;
			if (first && list.type.name === target) return null;
			const run = chain().deleteRange(range);
			if (!first) run.sinkListItem("listItem");
			run.command(({ tr }) => retype(tr, target)).run();
		},
	});
}

/**
 * The marker shortcuts inside list items. High priority, so they are tried
 * before StarterKit's rules for starting a new list.
 */
export const ListMarkers = Extension.create({
	name: "listMarkers",
	priority: 1000,

	addInputRules() {
		return [
			markerRule(/^\s*([-+*])\s$/, "bulletList"),
			markerRule(/^(\d+)\.\s$/, "orderedList"),
		];
	},
});

/**
 * Move the list item holding the caret one place up (-1) or down (1) among
 * its siblings, taking everything nested under it along. False when the caret
 * is not in a list; true (and nothing moves) at either end of the list.
 */
export function moveListItem(
	state: EditorState,
	dispatch: ((tr: Transaction) => void) | undefined,
	dir: -1 | 1,
): boolean {
	const { $from, from, to } = state.selection;
	let depth = $from.depth;
	while (depth > 0 && $from.node(depth).type.name !== "listItem") depth--;
	if (depth < 2) return false;
	const list = $from.node(depth - 1);
	const index = $from.index(depth - 1);
	const other = index + dir;
	if (other < 0 || other >= list.childCount) return true;
	const item = $from.node(depth);
	const sibling = list.child(other);
	const start = $from.before(depth);
	const [rangeFrom, rangeTo, nodes, moved] =
		dir < 0
			? [
					start - sibling.nodeSize,
					start + item.nodeSize,
					[item, sibling],
					start - sibling.nodeSize,
				]
			: [
					start,
					start + item.nodeSize + sibling.nodeSize,
					[sibling, item],
					start + sibling.nodeSize,
				];
	if (dispatch) {
		const tr = state.tr.replaceWith(rangeFrom, rangeTo, Fragment.from(nodes));
		tr.setSelection(
			TextSelection.create(
				tr.doc,
				moved + (from - start),
				moved + (to - start),
			),
		);
		dispatch(tr.scrollIntoView());
	}
	return true;
}

/**
 * Tab nests a list item under the one above and Shift-Tab moves it back out
 * (StarterKit's list item does both). Where neither can happen, such as Tab
 * on a list's first item, the key is swallowed instead of moving focus out of
 * the editor. Mod-Shift-Up and Down move an item among its siblings. Low
 * priority, so the list item and the slash menu go first.
 */
export const ListTabGuard = Extension.create({
	name: "listTabGuard",
	priority: 50,

	addKeyboardShortcuts() {
		const inList = () => this.editor.isActive("listItem");
		const move = (dir: -1 | 1) => () =>
			moveListItem(this.editor.state, this.editor.view.dispatch, dir);
		return {
			Tab: () => inList(),
			"Shift-Tab": () => inList(),
			// Workflowy's keys for moving an item, children and all.
			"Mod-Shift-ArrowUp": move(-1),
			"Mod-Shift-ArrowDown": move(1),
		};
	},
});
