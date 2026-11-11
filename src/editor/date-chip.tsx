import { mergeAttributes, Node } from "@tiptap/core";
import {
	type NodeViewProps,
	NodeViewWrapper,
	ReactNodeViewRenderer,
} from "@tiptap/react";

/** Today as YYYY-MM-DD in the person's own time zone. */
export function todayIso(now = new Date()): string {
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function DateChipView({ node, editor, updateAttributes }: NodeViewProps) {
	const date = typeof node.attrs.date === "string" ? node.attrs.date : "";
	return (
		<NodeViewWrapper as="span" className="date-chip" contentEditable={false}>
			<input
				type="date"
				aria-label="Date"
				value={ISO.test(date) ? date : ""}
				disabled={!editor.isEditable}
				onChange={(event) =>
					updateAttributes({ date: event.target.value || null })
				}
			/>
		</NodeViewWrapper>
	);
}

/**
 * A date inside a line of text, shown as a small chip you can click to change.
 * Saved as an inline item `{"type":"date","attrs":{"date":"2026-11-05"}}` inside
 * the block's `content`. It is inline, so it has no id of its own. An older
 * build that does not know it opens the note read-only (`checkBlocks`).
 */
export const DateChip = Node.create({
	name: "date",
	group: "inline",
	inline: true,
	atom: true,
	selectable: true,

	addAttributes() {
		return {
			date: {
				default: null,
				parseHTML: (element) => element.getAttribute("data-date"),
				renderHTML: (attributes) =>
					attributes.date ? { "data-date": attributes.date } : {},
			},
		};
	},

	parseHTML() {
		return [{ tag: 'span[data-type="date"]' }];
	},

	renderHTML({ node, HTMLAttributes }) {
		return [
			"span",
			mergeAttributes(HTMLAttributes, { "data-type": "date" }),
			String(node.attrs.date ?? ""),
		];
	},

	addNodeView() {
		return ReactNodeViewRenderer(DateChipView, { as: "span" } as never);
	},
});
