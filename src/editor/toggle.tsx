import { mergeAttributes, Node } from "@tiptap/core";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import {
	NodeViewContent,
	type NodeViewProps,
	NodeViewWrapper,
	ReactNodeViewRenderer,
} from "@tiptap/react";
import { ChevronRight } from "lucide-react";

/** What the summary line is: "paragraph", or "h1" / "h2" for a toggle heading. */
function summaryKind(node: NodeViewProps["node"]): string {
	const first = node.firstChild;
	return first?.type.name === "heading"
		? `h${String(first.attrs.level)}`
		: "paragraph";
}

function ToggleView({ node, editor, updateAttributes }: NodeViewProps) {
	const open = node.attrs.open === true;
	return (
		<NodeViewWrapper
			className="toggle"
			data-open={open}
			data-summary={summaryKind(node)}
		>
			<button
				type="button"
				className="toggle-chevron"
				contentEditable={false}
				disabled={!editor.isEditable}
				aria-expanded={open}
				aria-label={open ? "Collapse toggle" : "Expand toggle"}
				title={open ? "Collapse" : "Expand"}
				onClick={() => updateAttributes({ open: !open })}
			>
				<ChevronRight aria-hidden="true" />
			</button>
			<NodeViewContent className="toggle-content" />
		</NodeViewWrapper>
	);
}

/**
 * A collapsible block. Its first child is the summary line, a paragraph or
 * a heading (a "toggle heading"); everything after it is the body, which can
 * hold any block, including more toggles. The chevron shows or hides the body.
 * Stored as a container: a `toggle` line with `attrs.open` (left out while it
 * is closed, the default) and its blocks as child lines, summary first. A
 * toggle heading remembers whether it is open in the file, and moves together
 * with its body.
 *
 * Enter at the end of the summary of a closed toggle opens it and starts the
 * body. Enter on an empty last line leaves it. Backspace at the very start of
 * the summary unwraps it one level; on a toggle heading it turns the whole
 * thing back into a plain heading followed by its body, so nothing is lost or
 * left behind. The caret never rests inside a hidden
 * body: collapsing (or arrowing into) a closed toggle moves it to the end of
 * the summary.
 */
export const Toggle = Node.create({
	name: "toggle",
	group: "block",
	content: "(paragraph | heading) block*",
	defining: true,
	// Runs before the core Enter and Backspace handling.
	priority: 1000,

	addAttributes() {
		return {
			open: {
				default: false,
				parseHTML: (element) => element.getAttribute("data-open") === "true",
				renderHTML: (attributes) => ({
					"data-open": attributes.open === true ? "true" : "false",
				}),
			},
		};
	},

	parseHTML() {
		return [{ tag: 'div[data-type="toggle"]' }];
	},

	renderHTML({ HTMLAttributes }) {
		return [
			"div",
			mergeAttributes(HTMLAttributes, { "data-type": "toggle" }),
			0,
		];
	},

	addNodeView() {
		return ReactNodeViewRenderer(ToggleView);
	},

	addKeyboardShortcuts() {
		return {
			Enter: () => {
				const { $from, empty } = this.editor.state.selection;
				if (!empty || $from.depth < 2) return false;
				const toggle = $from.node(-1);
				if (toggle.type.name !== this.name || $from.index(-1) !== 0)
					return false;
				// An open toggle uses the normal split: the new line is the body.
				if (toggle.attrs.open === true) return false;
				const pos = $from.before(-1);
				return this.editor
					.chain()
					.command(({ tr }) => {
						tr.setNodeAttribute(pos, "open", true);
						return true;
					})
					.splitBlock()
					.run();
			},
			Backspace: () => {
				const { $from, empty } = this.editor.state.selection;
				if (!empty || $from.parentOffset !== 0 || $from.depth < 2) return false;
				if ($from.node(-1).type.name !== this.name || $from.index(-1) !== 0)
					return false;
				const toggle = $from.node(-1);
				if (toggle.firstChild?.type.name !== "heading")
					return this.editor.commands.lift(this.name);
				// A toggle heading becomes a plain heading with its body after it, if
				// the block around the toggle accepts those blocks in its place.
				const outer = $from.node(-2);
				const index = $from.index(-2);
				if (!outer.canReplace(index, index + 1, toggle.content))
					return this.editor.commands.lift(this.name);
				const pos = $from.before(-1);
				return this.editor.commands.command(({ tr }) => {
					tr.replaceWith(pos, pos + toggle.nodeSize, toggle.content);
					tr.setSelection(TextSelection.create(tr.doc, pos + 1));
					return true;
				});
			},
		};
	},

	addProseMirrorPlugins() {
		const name = this.name;
		return [
			new Plugin({
				key: new PluginKey("toggleHiddenBody"),
				appendTransaction(transactions, _before, state) {
					if (!transactions.some((tr) => tr.docChanged || tr.selectionSet))
						return null;
					const { $head } = state.selection;
					// The outermost closed toggle whose body holds the caret.
					for (let depth = 0; depth < $head.depth; depth++) {
						const node = $head.node(depth);
						if (
							node.type.name === name &&
							node.attrs.open !== true &&
							$head.index(depth) > 0
						) {
							const summaryEnd =
								$head.start(depth) + node.child(0).nodeSize - 1;
							return state.tr.setSelection(
								TextSelection.create(state.doc, summaryEnd),
							);
						}
					}
					return null;
				},
			}),
		];
	},
});
