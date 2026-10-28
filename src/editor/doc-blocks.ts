import { getSchema, type JSONContent } from "@tiptap/core";
import type { NodeType } from "@tiptap/pm/model";
import type { Block, JsonValue } from "../core/note-format";
import { BLOCK_TYPES } from "./blocks";
import { createExtensions } from "./extensions";

const schema = getSchema(createExtensions());
const KNOWN = new Set<string>(BLOCK_TYPES);
const BLOCK_KEYS = new Set(["id", "type", "parent", "attrs", "content"]);

function nodeType(name: string): NodeType {
	const type = schema.nodes[name];
	if (!type || !KNOWN.has(name)) throw new Error(`unknown block type ${name}`);
	return type;
}

/** Attributes the node declares, other than the id. */
function declaredAttrs(type: NodeType): string[] {
	return Object.keys(type.spec.attrs ?? {}).filter((name) => name !== "id");
}

function sameValue(a: unknown, b: unknown): boolean {
	return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * The editor document as note blocks (the file's lines): one block per
 * block-level node, children after their parent, `parent` the id of the block
 * it sits in. Attributes equal to their default are left out, so a note that
 * was not edited saves back to identical bytes. Inline content stays in the
 * block's `content`.
 */
export function docToBlocks(doc: JSONContent): Block[] {
	const blocks: Block[] = [];

	function visit(node: JSONContent, parent: string | null): void {
		const type = nodeType(node.type ?? "");
		const id = node.attrs?.id;
		const block: Block = {
			type: type.name,
			parent,
			...(typeof id === "string" && id !== "" ? { id } : {}),
		};
		const attrs: Record<string, JsonValue> = {};
		for (const name of declaredAttrs(type)) {
			const value = node.attrs?.[name];
			if (
				value !== undefined &&
				!sameValue(value, type.spec.attrs?.[name]?.default)
			) {
				attrs[name] = value as JsonValue;
			}
		}
		if (Object.keys(attrs).length > 0) block.attrs = attrs;
		if (type.inlineContent) {
			if (node.content && node.content.length > 0) {
				block.content = node.content as unknown as JsonValue;
			}
			blocks.push(block);
			return;
		}
		blocks.push(block);
		for (const child of node.content ?? []) {
			visit(child, typeof id === "string" ? id : null);
		}
	}

	for (const node of doc.content ?? []) visit(node, null);
	return blocks;
}

/**
 * Note blocks as an editor document. Throws if a block refers to a parent that
 * does not come before it, or names an unknown type; use `checkBlocks` first
 * for notes that may not be fully understood.
 */
export function blocksToDoc(blocks: Block[]): JSONContent {
	const root: JSONContent[] = [];
	const byId = new Map<string, JSONContent>();
	for (const block of blocks) {
		const type = nodeType(block.type);
		const node: JSONContent = {
			type: type.name,
			attrs: {
				...(typeof block.id === "string" ? { id: block.id } : {}),
				...((block.attrs as Record<string, unknown> | undefined) ?? {}),
			},
		};
		if (Array.isArray(block.content)) {
			node.content = block.content as unknown as JSONContent[];
		}
		if (block.parent === null) {
			root.push(node);
		} else {
			const parent = byId.get(block.parent);
			if (!parent)
				throw new Error(`parent ${block.parent} does not come first`);
			if (!parent.content) parent.content = [];
			parent.content.push(node);
		}
		if (typeof block.id === "string") byId.set(block.id, node);
	}
	// A note with no blocks still needs one paragraph to type in.
	if (root.length === 0) root.push({ type: "paragraph", attrs: {} });
	return { type: "doc", content: root };
}

export type Understood = { ok: true } | { ok: false; reason: string };

/**
 * Whether every block is fully understood by this version: a known type, only
 * the keys `id, type, parent, attrs, content`, only declared attributes, inline
 * content only where the node takes it, and a structure the editor accepts.
 * Anything else must not be edited and saved, or data would be lost.
 */
export function checkBlocks(blocks: Block[]): Understood {
	for (const block of blocks) {
		if (!KNOWN.has(block.type)) {
			return { ok: false, reason: `a block of type "${block.type}"` };
		}
		const type = nodeType(block.type);
		const extra = Object.keys(block).filter((key) => !BLOCK_KEYS.has(key));
		if (extra.length > 0) {
			return {
				ok: false,
				reason: `an extra field "${extra[0]}" on a ${block.type}`,
			};
		}
		if (block.attrs !== undefined) {
			const attrs = block.attrs;
			if (typeof attrs !== "object" || attrs === null || Array.isArray(attrs)) {
				return {
					ok: false,
					reason: `unreadable attributes on a ${block.type}`,
				};
			}
			const allowed = new Set(declaredAttrs(type));
			const unknown = Object.keys(attrs).find((key) => !allowed.has(key));
			if (unknown !== undefined) {
				return {
					ok: false,
					reason: `an unknown attribute "${unknown}" on a ${block.type}`,
				};
			}
		}
		if (block.content !== undefined && !type.inlineContent) {
			return { ok: false, reason: `content inside a ${block.type}` };
		}
	}
	try {
		schema.nodeFromJSON(blocksToDoc(blocks)).check();
	} catch {
		return { ok: false, reason: "a block layout this version can't edit" };
	}
	return { ok: true };
}
