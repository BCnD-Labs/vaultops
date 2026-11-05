import { mergeAttributes, Node } from "@tiptap/core";
import {
	NodeViewContent,
	type NodeViewProps,
	NodeViewWrapper,
	ReactNodeViewRenderer,
} from "@tiptap/react";
import {
	Info,
	Lightbulb,
	OctagonAlert,
	StickyNote,
	TriangleAlert,
} from "lucide-react";

export const CALLOUT_TONES = [
	"note",
	"info",
	"tip",
	"warning",
	"danger",
] as const;
export type CalloutTone = (typeof CALLOUT_TONES)[number];

export const CALLOUT_ICONS = {
	note: StickyNote,
	info: Info,
	tip: Lightbulb,
	warning: TriangleAlert,
	danger: OctagonAlert,
} as const;

export function toneOf(value: unknown): CalloutTone {
	return CALLOUT_TONES.find((tone) => tone === value) ?? "note";
}

function CalloutView({ node, editor, updateAttributes }: NodeViewProps) {
	const tone = toneOf(node.attrs.tone);
	const Icon = CALLOUT_ICONS[tone];
	const next = toneOf(CALLOUT_TONES[CALLOUT_TONES.indexOf(tone) + 1]);
	return (
		<NodeViewWrapper className="callout" data-tone={tone}>
			<button
				type="button"
				className="callout-icon"
				contentEditable={false}
				disabled={!editor.isEditable}
				aria-label={`Callout type: ${tone}. Change to ${next}`}
				title={`Callout type: ${tone} (click to change)`}
				onClick={() => updateAttributes({ tone: next })}
			>
				<Icon aria-hidden="true" />
			</button>
			<NodeViewContent className="callout-body" />
		</NodeViewWrapper>
	);
}

/**
 * A tinted box around one or more paragraphs, with a tone (note, info, tip,
 * warning, danger) shown as an icon and a theme color. Stored as a container:
 * a `callout` line with `attrs.tone` (left out when it is the default, note)
 * and its paragraphs as child lines. Enter on an empty last line leaves it;
 * Backspace at the very start unwraps it one level.
 */
export const Callout = Node.create({
	name: "callout",
	group: "block",
	content: "paragraph+",
	defining: true,
	// Runs before the core Enter and Backspace handling.
	priority: 1000,

	addAttributes() {
		return {
			tone: {
				default: "note",
				parseHTML: (element) => element.getAttribute("data-tone") ?? "note",
				renderHTML: (attributes) => ({ "data-tone": attributes.tone }),
			},
		};
	},

	parseHTML() {
		return [{ tag: 'div[data-type="callout"]' }];
	},

	renderHTML({ HTMLAttributes }) {
		return [
			"div",
			mergeAttributes(HTMLAttributes, { "data-type": "callout" }),
			0,
		];
	},

	addNodeView() {
		return ReactNodeViewRenderer(CalloutView);
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
