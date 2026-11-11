import { InputRule, mergeAttributes, Node } from "@tiptap/core";
import { Plugin, TextSelection } from "@tiptap/pm/state";

export const DIVIDER_STYLES = ["solid", "dashed", "dotted", "thick"] as const;
export type DividerStyle = (typeof DIVIDER_STYLES)[number];

export function dividerStyleOf(value: unknown): DividerStyle {
	return DIVIDER_STYLES.find((style) => style === value) ?? "solid";
}

/**
 * A horizontal rule between blocks. No content: one line in the note,
 * `{"type":"divider", ...}`, with an optional `attrs.style` (solid, dashed,
 * dotted or thick; left out when solid). Typing `---`, `___ ` or `*** ` in an
 * empty paragraph makes one and leaves the caret in a new paragraph after it;
 * double-clicking a divider moves it to the next style.
 */
export const Divider = Node.create({
	name: "divider",
	group: "block",
	atom: true,
	selectable: true,

	addAttributes() {
		return {
			style: {
				default: "solid",
				parseHTML: (element) =>
					dividerStyleOf(element.getAttribute("data-style")),
				renderHTML: (attributes) => ({
					"data-style": dividerStyleOf(attributes.style),
				}),
			},
		};
	},

	parseHTML() {
		return [{ tag: 'hr[data-type="divider"]' }, { tag: "hr" }];
	},

	renderHTML({ HTMLAttributes }) {
		return ["hr", mergeAttributes(HTMLAttributes, { "data-type": "divider" })];
	},

	addProseMirrorPlugins() {
		return [
			new Plugin({
				props: {
					handleDoubleClickOn: (view, _pos, node, nodePos) => {
						if (node.type.name !== "divider" || !view.editable) return false;
						const next =
							DIVIDER_STYLES[
								(DIVIDER_STYLES.indexOf(dividerStyleOf(node.attrs.style)) + 1) %
									DIVIDER_STYLES.length
							];
						view.dispatch(
							view.state.tr.setNodeMarkup(nodePos, undefined, {
								...node.attrs,
								style: next,
							}),
						);
						return true;
					},
				},
			}),
		];
	},

	addInputRules() {
		return [
			new InputRule({
				find: /^(?:---|—-|___\s|\*\*\*\s)$/,
				handler: ({ state, range }) => {
					const { tr, schema } = state;
					const divider = schema.nodes.divider;
					const paragraph = schema.nodes.paragraph;
					if (!divider || !paragraph) return null;
					tr.delete(range.from, range.to);
					const $at = tr.doc.resolve(range.from);
					if ($at.parent.type !== paragraph || $at.parent.content.size > 0)
						return null;
					const start = $at.before();
					tr.replaceWith(start, $at.after(), [
						divider.create(),
						paragraph.create(),
					]);
					tr.setSelection(TextSelection.create(tr.doc, start + 2));
				},
			}),
		];
	},
});
