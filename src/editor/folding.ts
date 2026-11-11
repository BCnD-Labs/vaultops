import { Extension } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

/** Which blocks are folded, by block id. View state only: never saved. */
export const foldKey = new PluginKey<ReadonlySet<string>>("fold");

function idOf(node: PMNode): string | null {
	const id = node.attrs.id;
	return typeof id === "string" && id !== "" ? id : null;
}

function chevron(
	view: import("@tiptap/pm/view").EditorView,
	id: string,
	folded: boolean,
) {
	const button = document.createElement("button");
	button.type = "button";
	button.className = "fold-toggle";
	button.contentEditable = "false";
	button.dataset.folded = String(folded);
	button.setAttribute("aria-label", folded ? "Unfold" : "Fold");
	button.setAttribute("aria-expanded", String(!folded));
	// mousedown keeps the caret where it is.
	button.addEventListener("mousedown", (event) => {
		event.preventDefault();
		view.dispatch(view.state.tr.setMeta(foldKey, id));
	});
	return button;
}

/**
 * Fold chevrons on headings (hides everything up to the next heading of the
 * same or a higher level) and on list items that have nested content (hides
 * the nested part). A folded block shows an ellipsis. Nothing is removed from
 * the document: the hidden blocks are only given a class.
 */
export const Folding = Extension.create({
	name: "folding",

	addProseMirrorPlugins() {
		return [
			new Plugin<ReadonlySet<string>>({
				key: foldKey,
				state: {
					init: () => new Set<string>(),
					apply(tr, folded) {
						const toggled = tr.getMeta(foldKey) as string | undefined;
						if (toggled === undefined) return folded;
						const next = new Set(folded);
						if (!next.delete(toggled)) next.add(toggled);
						return next;
					},
				},
				props: {
					decorations(state) {
						const folded = foldKey.getState(state) ?? new Set<string>();
						const found: Decoration[] = [];
						const widget = (pos: number, id: string, isFolded: boolean) =>
							Decoration.widget(pos, (view) => chevron(view, id, isFolded), {
								side: -1,
								key: `fold-${id}-${isFolded}`,
							});
						const { doc } = state;

						// Headings fold the top-level blocks that follow them.
						const top: { node: PMNode; pos: number }[] = [];
						doc.forEach((node, pos) => {
							top.push({ node, pos });
						});
						top.forEach(({ node, pos }, index) => {
							const id = idOf(node);
							if (node.type.name !== "heading" || id === null) return;
							const level = node.attrs.level as number;
							let end = index + 1;
							while (end < top.length) {
								const next = top[end]?.node;
								if (
									next?.type.name === "heading" &&
									(next.attrs.level as number) <= level
								)
									break;
								end++;
							}
							if (end === index + 1) return;
							const isFolded = folded.has(id);
							found.push(widget(pos + 1, id, isFolded));
							if (isFolded) {
								found.push(
									Decoration.node(pos, pos + node.nodeSize, {
										class: "is-folded",
									}),
								);
								for (const hidden of top.slice(index + 1, end)) {
									found.push(
										Decoration.node(
											hidden.pos,
											hidden.pos + hidden.node.nodeSize,
											{ class: "fold-hidden" },
										),
									);
								}
							}
						});

						// List items fold everything after their first line.
						doc.descendants((node, pos) => {
							if (node.type.name !== "listItem" || node.childCount < 2) return;
							const id = idOf(node);
							if (id === null) return;
							const isFolded = folded.has(id);
							found.push(widget(pos + 1, id, isFolded));
							if (isFolded) {
								found.push(
									Decoration.node(pos, pos + node.nodeSize, {
										class: "is-folded",
									}),
								);
								let child = pos + 1;
								node.forEach((part, _offset, index) => {
									if (index > 0) {
										found.push(
											Decoration.node(child, child + part.nodeSize, {
												class: "fold-hidden",
											}),
										);
									}
									child += part.nodeSize;
								});
							}
						});
						return DecorationSet.create(doc, found);
					},
				},
			}),
		];
	},
});
