import type { Extensions } from "@tiptap/core";
import { UniqueID } from "@tiptap/extension-unique-id";
import StarterKit from "@tiptap/starter-kit";
import { BLOCK_TYPES } from "./blocks";
import { Callout } from "./callout";
import { Divider } from "./divider";
import { SlashMenu } from "./slash-menu";
import { TaskBlock } from "./task-block";
import { Toggle } from "./toggle";

/**
 * The editor's extensions. StarterKit supplies paragraph, headings, lists,
 * quote, code block and the bold, italic, strike and code marks; divider,
 * callout and toggle are our own nodes (StarterKit's horizontal rule stays off); the pieces
 * this phase does not use are off (horizontal rule, underline, links) and so
 * is the trailing node, which would add an empty paragraph to the end of
 * every note that then gets saved.
 */
export function createExtensions(): Extensions {
	return [
		StarterKit.configure({
			heading: { levels: [1, 2] },
			dropcursor: { color: false, class: "block-drop-indicator" },
			horizontalRule: false,
			underline: false,
			link: false,
			trailingNode: false,
		}),
		TaskBlock,
		Divider,
		Callout,
		Toggle,
		SlashMenu,
		UniqueID.configure({
			attributeName: "id",
			types: [...BLOCK_TYPES],
			generateID: () => crypto.randomUUID(),
		}),
	];
}
