import { mergeAttributes, Node } from "@tiptap/core";
import {
	NodeViewContent,
	type NodeViewProps,
	NodeViewWrapper,
	ReactNodeViewRenderer,
} from "@tiptap/react";
import { Switch } from "@/components/ui/switch";

function SwitchView({ node, editor, updateAttributes }: NodeViewProps) {
	const off = node.attrs.off === true;
	return (
		<NodeViewWrapper className="switch-block" data-off={off}>
			<div className="switch-control" contentEditable={false}>
				<Switch
					checked={!off}
					disabled={!editor.isEditable}
					aria-label={off ? "Turn block on" : "Turn block off"}
					onCheckedChange={(on) => updateAttributes({ off: !on })}
				/>
			</div>
			<NodeViewContent className="switch-content" />
		</NodeViewWrapper>
	);
}

/**
 * A block with an on/off switch. On, it looks like any other block; off, it is
 * dimmed with a thin border and faint scan lines, so it reads as done or paused
 * without being a completed task. The switch changes nothing else. Stored as a
 * container: a `switch` line with `attrs.off` (left out while it is on, the
 * default) and its blocks as child lines.
 */
export const SwitchBlock = Node.create({
	name: "switch",
	group: "block",
	content: "block+",
	defining: true,
	priority: 1000,

	addAttributes() {
		return {
			off: {
				default: false,
				parseHTML: (element) => element.getAttribute("data-off") === "true",
				renderHTML: (attributes) => ({
					"data-off": attributes.off === true ? "true" : "false",
				}),
			},
		};
	},

	parseHTML() {
		return [{ tag: 'div[data-type="switch"]' }];
	},

	renderHTML({ HTMLAttributes }) {
		return [
			"div",
			mergeAttributes(HTMLAttributes, { "data-type": "switch" }),
			0,
		];
	},

	addNodeView() {
		return ReactNodeViewRenderer(SwitchView);
	},

	addKeyboardShortcuts() {
		return {
			Backspace: () => {
				const { $from, empty } = this.editor.state.selection;
				if (!empty || $from.parentOffset !== 0 || $from.depth < 2) return false;
				if ($from.node(-1).type.name !== this.name || $from.index(-1) !== 0)
					return false;
				return this.editor.commands.lift(this.name);
			},
		};
	},
});
