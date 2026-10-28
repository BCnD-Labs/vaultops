import { mergeAttributes, Node } from "@tiptap/core";

/**
 * A flat task: inline text with a checkbox in front, one `checked` attribute.
 * Deliberately not Tiptap's task list wrapper: several tasks in a row are the
 * list, and a flat block converts and tracks cleanly (one id, one line).
 */
export const TaskBlock = Node.create({
	name: "taskBlock",
	group: "block",
	content: "inline*",
	defining: true,
	// Runs before the core Enter and Backspace handling.
	priority: 1000,

	addAttributes() {
		return {
			checked: {
				default: false,
				parseHTML: (element) => element.getAttribute("data-checked") === "true",
				renderHTML: (attributes) => ({
					"data-checked": attributes.checked ? "true" : "false",
				}),
			},
		};
	},

	parseHTML() {
		return [{ tag: 'div[data-type="task-block"]' }];
	},

	renderHTML({ HTMLAttributes }) {
		return [
			"div",
			mergeAttributes(HTMLAttributes, { "data-type": "task-block" }),
			0,
		];
	},

	addNodeView() {
		return ({ node: initial, getPos, editor }) => {
			let node = initial;
			const dom = document.createElement("div");
			dom.className = "task-block";
			dom.dataset.type = "task-block";
			const box = document.createElement("input");
			box.type = "checkbox";
			box.className = "task-block-box";
			box.setAttribute("aria-label", "Done");
			const text = document.createElement("div");
			text.className = "task-block-text";
			dom.append(box, text);

			const sync = () => {
				box.checked = node.attrs.checked === true;
				dom.dataset.checked = String(box.checked);
			};
			sync();

			box.addEventListener("change", () => {
				const pos = typeof getPos === "function" ? getPos() : undefined;
				if (pos === undefined) return;
				editor.view.dispatch(
					editor.state.tr.setNodeMarkup(pos, undefined, {
						...node.attrs,
						checked: box.checked,
					}),
				);
			});

			return {
				dom,
				contentDOM: text,
				update(updated) {
					if (updated.type !== node.type) return false;
					node = updated;
					sync();
					return true;
				},
				// The checkbox is a control, not text: ProseMirror must not treat it as content.
				stopEvent: (event) => event.target === box,
				ignoreMutation: (mutation) =>
					mutation.target === box ||
					(mutation.type === "attributes" && mutation.target === dom),
			};
		};
	},

	addKeyboardShortcuts() {
		const toParagraph = () => {
			const { state, view } = this.editor;
			const { $from } = state.selection;
			const paragraph = state.schema.nodes.paragraph;
			if (!paragraph) return false;
			view.dispatch(
				state.tr.setNodeMarkup($from.before(), paragraph, {
					id: $from.parent.attrs.id ?? null,
				}),
			);
			return true;
		};
		return {
			// Enter continues the list of tasks; Enter on an empty task ends it.
			Enter: () => {
				const { state, view } = this.editor;
				const { $from, empty } = state.selection;
				if (!empty || $from.parent.type.name !== this.name) return false;
				if ($from.parent.content.size === 0) return toParagraph();
				view.dispatch(
					state.tr
						.split($from.pos, 1, [
							{ type: $from.parent.type, attrs: { checked: false } },
						])
						.scrollIntoView(),
				);
				return true;
			},
			// Backspace at the start of a task turns it back into a paragraph.
			Backspace: () => {
				const { $from, empty } = this.editor.state.selection;
				if (!empty || $from.parent.type.name !== this.name) return false;
				if ($from.parentOffset !== 0) return false;
				return toParagraph();
			},
		};
	},
});
