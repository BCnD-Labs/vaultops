import { Mark, mergeAttributes } from "@tiptap/core";

/**
 * Inline "keyboard key" text, shown as a small raised key (Ctrl, Enter, K).
 * Saved as a `kbd` mark on the text. An older build that does not know the mark
 * opens the note read-only (`checkBlocks`), so nothing is lost.
 */
export const Kbd = Mark.create({
	name: "kbd",

	parseHTML() {
		return [{ tag: "kbd" }];
	},

	renderHTML({ HTMLAttributes }) {
		return ["kbd", mergeAttributes(HTMLAttributes), 0];
	},

	addKeyboardShortcuts() {
		return { "Mod-Alt-k": () => this.editor.commands.toggleMark(this.name) };
	},
});
