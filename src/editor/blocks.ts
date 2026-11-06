/**
 * Every block-level node type that carries a permanent id, in one list.
 * The note format needs an id on each of these (see the save guard), and the
 * schema test fails when a node is added to the editor without being listed.
 *
 * Not here yet: the inline date chip (inline nodes never get an id).
 */
export const BLOCK_TYPES = [
	"paragraph",
	"heading",
	"bulletList",
	"orderedList",
	"listItem",
	"taskBlock",
	"codeBlock",
	"blockquote",
	"callout",
	"divider",
	"toggle",
	"switch",
	"table",
	"tableRow",
	"tableHeader",
	"tableCell",
] as const;

export type BlockType = (typeof BLOCK_TYPES)[number];
