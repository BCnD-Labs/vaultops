import type { Extensions } from "@tiptap/core";
import { UniqueID } from "@tiptap/extension-unique-id";
import StarterKit from "@tiptap/starter-kit";
import { BLOCK_TYPES } from "./blocks";
import { TaskBlock } from "./task-block";

/**
 * The editor's extensions. StarterKit supplies paragraph, headings, lists,
 * quote, code block and the bold, italic, strike and code marks; the pieces
 * this phase does not use are off (horizontal rule, underline, links) and so
 * is the trailing node, which would add an empty paragraph to the end of
 * every note that then gets saved.
 */
export function createExtensions(): Extensions {
	return [
		StarterKit.configure({
			heading: { levels: [1, 2] },
			horizontalRule: false,
			underline: false,
			link: false,
			trailingNode: false,
		}),
		TaskBlock,
		UniqueID.configure({
			attributeName: "id",
			types: [...BLOCK_TYPES],
			generateID: () => crypto.randomUUID(),
		}),
	];
}
