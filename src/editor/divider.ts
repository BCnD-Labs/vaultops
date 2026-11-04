import { InputRule, mergeAttributes, Node } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";

/**
 * A thin horizontal rule between blocks. No content, no attributes: one line
 * in the note, `{"type":"divider", ...}`. Typing `---`, `___ ` or `*** ` in an
 * empty paragraph makes one and leaves the caret in a new paragraph after it.
 */
export const Divider = Node.create({
	name: "divider",
	group: "block",
	atom: true,
	selectable: true,

	parseHTML() {
		return [{ tag: 'hr[data-type="divider"]' }, { tag: "hr" }];
	},

	renderHTML({ HTMLAttributes }) {
		return ["hr", mergeAttributes(HTMLAttributes, { "data-type": "divider" })];
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
