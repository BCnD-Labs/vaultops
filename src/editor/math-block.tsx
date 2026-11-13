import { type Editor, mergeAttributes, Node } from "@tiptap/core";
import { NodeSelection, Selection } from "@tiptap/pm/state";
import {
	type NodeViewProps,
	NodeViewWrapper,
	ReactNodeViewRenderer,
} from "@tiptap/react";
import { useEffect, useState } from "react";
import { MathField, type MathLeave } from "./MathField";

/** A math block's `latex` attribute: the LaTeX source, empty if missing or not text. */
export function latexOf(value: unknown): string {
	return typeof value === "string" ? value : "";
}

/** Whether the editor can be edited, redrawn when that changes (a node view isn't). */
function useEditable(editor: Editor): boolean {
	const [editable, setEditable] = useState(editor.isEditable);
	useEffect(() => {
		const sync = () => setEditable(editor.isEditable);
		sync();
		editor.on("update", sync);
		editor.on("transaction", sync);
		return () => {
			editor.off("update", sync);
			editor.off("transaction", sync);
		};
	}, [editor]);
	return editable;
}

function MathBlockView({ node, editor, getPos, selected }: NodeViewProps) {
	const latex = latexOf(node.attrs.latex);
	const editable = useEditable(editor);

	const place = (): number | null => {
		const pos = getPos();
		return typeof pos === "number" ? pos : null;
	};

	const change = (next: string) => {
		const pos = place();
		if (pos === null || next === latexOf(node.attrs.latex)) return;
		editor.view.dispatch(
			editor.state.tr.setNodeMarkup(pos, undefined, {
				...node.attrs,
				latex: next,
			}),
		);
	};

	const leave = (where: MathLeave) => {
		const pos = place();
		if (pos === null) return;
		const { state, view } = editor;
		let tr = state.tr;
		const after = pos + node.nodeSize;
		if (where === "after" && after >= state.doc.content.size) {
			// Nothing follows: give the caret somewhere to go.
			const paragraph = state.schema.nodes.paragraph;
			if (paragraph) tr = tr.insert(after, paragraph.create());
		}
		const target = where === "after" ? after : pos;
		const direction = where === "after" ? 1 : -1;
		tr = tr.setSelection(Selection.near(tr.doc.resolve(target), direction));
		view.dispatch(tr);
		view.focus();
	};

	const remove = () => {
		const pos = place();
		if (pos === null) return;
		const { state, view } = editor;
		const tr = state.tr.delete(pos, pos + node.nodeSize);
		const at = Math.min(pos, tr.doc.content.size);
		tr.setSelection(Selection.near(tr.doc.resolve(at), -1));
		view.dispatch(tr);
		view.focus();
	};

	return (
		<NodeViewWrapper
			className="math-block"
			data-selected={selected && editable ? "true" : undefined}
			contentEditable={false}
		>
			<MathField
				value={latex}
				readOnly={!editable}
				focused={selected}
				onChange={change}
				onLeave={leave}
				onEmptyDelete={remove}
			/>
		</NodeViewWrapper>
	);
}

/**
 * Put an empty math block where the slash menu was, in place of an empty line
 * or after the current one, with a paragraph after it, and select it: a
 * selected math block takes the caret into its field, so it starts in edit mode.
 */
export function insertMathBlock(
	editor: Editor,
	range: { from: number; to: number },
): boolean {
	return editor
		.chain()
		.focus()
		.deleteRange(range)
		.insertContent([{ type: "mathBlock" }, { type: "paragraph" }])
		.command(({ tr }) => {
			const $at = tr.selection.$from;
			if ($at.depth < 1) return true;
			const before = tr.doc.resolve($at.before(1)).nodeBefore;
			if (before?.type.name !== "mathBlock") return true;
			tr.setSelection(
				NodeSelection.create(tr.doc, $at.before(1) - before.nodeSize),
			);
			return true;
		})
		.run();
}

/**
 * A block for an equation, edited visually. One line in the note,
 * `{"type":"mathBlock","attrs":{"latex":"\\frac{a}{b}"}}`: the LaTeX source as
 * plain text, so the file stays readable. It has no inline content, and no
 * `latex` (an empty block) leaves out the attributes.
 */
export const MathBlock = Node.create({
	name: "mathBlock",
	group: "block",
	atom: true,
	selectable: true,
	draggable: true,

	addAttributes() {
		return {
			latex: {
				default: "",
				parseHTML: (element) => element.getAttribute("data-latex") ?? "",
				renderHTML: (attributes) => ({
					"data-latex": latexOf(attributes.latex),
				}),
			},
		};
	},

	// Copied as plain text, a math block is its LaTeX.
	renderText: ({ node }) => latexOf(node.attrs.latex),

	parseHTML() {
		return [{ tag: 'div[data-type="math-block"]' }];
	},

	renderHTML({ HTMLAttributes }) {
		return [
			"div",
			mergeAttributes(HTMLAttributes, { "data-type": "math-block" }),
		];
	},

	addNodeView() {
		return ReactNodeViewRenderer(MathBlockView, {
			// The equation field handles its own keys and mouse (a drag of the
			// block itself still goes to the editor).
			stopEvent: ({ event }) => {
				const target = event.target;
				return (
					target instanceof Element &&
					target.closest("math-field") !== null &&
					!event.type.startsWith("drag")
				);
			},
			ignoreMutation: () => true,
		});
	},
});
