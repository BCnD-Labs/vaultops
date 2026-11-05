import type { Extensions } from "@tiptap/core";
import Highlight from "@tiptap/extension-highlight";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
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
 * quote, code block and the bold, italic, strike, underline and code marks;
 * highlight, subscript and superscript are added marks; divider, callout and
 * toggle are our own nodes (StarterKit's horizontal rule stays off); the pieces
 * this phase does not use are off (horizontal rule, links) and so is the
 * trailing node, which would add an empty paragraph to the end of every note
 * that then gets saved.
 */
export function createExtensions(): Extensions {
	return [
		StarterKit.configure({
			heading: { levels: [1, 2] },
			dropcursor: { color: false, class: "block-drop-indicator" },
			horizontalRule: false,
			link: false,
			trailingNode: false,
		}),
		Highlight,
		// Text cannot be raised and lowered at once: adding one replaces the other.
		Subscript.extend({ excludes: "superscript" }),
		Superscript.extend({ excludes: "subscript" }),
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
