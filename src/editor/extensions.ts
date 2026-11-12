import type { Extensions } from "@tiptap/core";
import Highlight from "@tiptap/extension-highlight";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import {
	Table,
	TableCell,
	TableHeader,
	TableRow,
} from "@tiptap/extension-table";
import { UniqueID } from "@tiptap/extension-unique-id";
import StarterKit from "@tiptap/starter-kit";
import { QuoteColor } from "./blockquote";
import { BLOCK_TYPES } from "./blocks";
import { Callout } from "./callout";
import { CodeBlock, CodeLanguage } from "./code-language";
import { Column, Columns, Document, PageDocument } from "./columns";
import { Database, DatabaseRow } from "./database/database";
import { DateChip } from "./date-chip";
import { Divider } from "./divider";
import { DropSlot } from "./drop-slot";
import { Folding } from "./folding";
import { Kbd } from "./kbd";
import { ListMarkers, ListTabGuard } from "./list-nesting";
import { MathBlock } from "./math-block";
import { MoveOut } from "./move-out";
import { LinkMenu, NoteLink } from "./note-link";
import { SlashMenu } from "./slash-menu";
import { SwitchBlock } from "./switch";
import { TaskBlock } from "./task-block";
import { Toggle } from "./toggle";

/**
 * The editor's extensions. StarterKit supplies paragraph, headings, lists,
 * quote, code block and the bold, italic, strike, underline and code marks;
 * highlight, subscript, superscript and kbd are added marks, the date chip is an
 * added inline node, note links are another with their `[[` and `@` pickers and the code language picker a view-only plugin; divider, callout and
 * toggle are our own nodes (StarterKit's horizontal rule stays off); the pieces
 * this phase does not use are off (horizontal rule, links) and so is the
 * trailing node, which would add an empty paragraph to the end of every note
 * that then gets saved.
 */
export function createExtensions(): Extensions {
	return [
		StarterKit.configure({
			codeBlock: false,
			document: false,
			heading: { levels: [1, 2, 3, 4, 5, 6] },
			dropcursor: { color: false, class: "block-drop-indicator" },
			horizontalRule: false,
			link: false,
			trailingNode: false,
		}),
		CodeBlock,
		Highlight,
		// Text cannot be raised and lowered at once: adding one replaces the other.
		Subscript.extend({ excludes: "superscript" }),
		Superscript.extend({ excludes: "subscript" }),
		Kbd,
		DateChip,
		NoteLink,
		LinkMenu,
		CodeLanguage,
		QuoteColor,
		TaskBlock,
		Divider,
		MathBlock,
		Callout,
		Toggle,
		Document,
		Columns,
		Column,
		SwitchBlock,
		// Resizable: drag a column edge to set its width (saved as the cell's colwidth).
		Table.configure({ resizable: true }),
		TableRow,
		TableHeader,
		TableCell,
		Database.configure({ pageExtensions: createPageExtensions }),
		DatabaseRow,
		SlashMenu,
		Folding,
		DropSlot,
		MoveOut,
		ListMarkers,
		ListTabGuard,
		UniqueID.configure({
			attributeName: "id",
			types: [...BLOCK_TYPES],
			generateID: () => crypto.randomUUID(),
		}),
	];
}

/**
 * The editor for a database row's page (the row page panel): the note's
 * editor with a top node that takes no columns and no database.
 */
export function createPageExtensions(): Extensions {
	return createExtensions().map((extension) =>
		extension.name === "doc" ? PageDocument : extension,
	);
}
