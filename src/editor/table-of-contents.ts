import type { Editor } from "@tiptap/core";
import { outlineOf } from "../core/notes/outline";
import { tocList } from "../core/notes/toc";
import { notify } from "../ui/notify";
import { insertBlocksAtCaret } from "./insert-blocks";

/**
 * Put the note's table of contents where the typed `/` command was: an
 * ordinary bulleted list of the headings' text, nested by level. A note with
 * no headings gets a toast and no change; the typed command stays in place.
 */
export function insertTableOfContents(
	editor: Editor,
	range: { from: number; to: number },
): boolean {
	const list = tocList(outlineOf(editor.getJSON()));
	if (!list) {
		notify("No headings yet", {
			description: "Add a heading to the note, then try again.",
		});
		return false;
	}
	// The caret goes to where the command was, so the list lands there.
	editor.chain().focus().deleteRange(range).setTextSelection(range.from).run();
	return insertBlocksAtCaret(editor, [list]);
}
