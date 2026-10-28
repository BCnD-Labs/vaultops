/**
 * Every block-level node type that carries a permanent id, in one list.
 * The note format needs an id on each of these (see the save guard), and the
 * schema test fails when a node is added to the editor without being listed.
 *
 * Not here yet: tables (with T13a, which needs the table extension) and the
 * inline date chip (inline nodes never get an id).
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
] as const;

export type BlockType = (typeof BLOCK_TYPES)[number];
