import { getSchema, type JSONContent } from "@tiptap/core";
import type { MarkType, NodeType } from "@tiptap/pm/model";
import type { Block, JsonValue } from "../core/note-format";
import { BLOCK_TYPES } from "./blocks";
import { createExtensions, INLINE_EXTRA_ATTR } from "./extensions";

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

type InlineType = NodeType | MarkType | undefined;
const record = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

function withExtra(
	attrs: Record<string, unknown> | undefined,
	type: InlineType,
) {
	if (!attrs || !type || type.name === "text") return attrs;
	const declared = type.spec.attrs ?? {};
	const extra = Object.fromEntries(
		Object.entries(attrs).filter(([key]) => !(key in declared)),
	);
	if (!Object.keys(extra).length) return attrs;
	const known = Object.fromEntries(
		Object.entries(attrs).filter(([key]) => key in declared),
	);
	return { ...known, [INLINE_EXTRA_ATTR]: extra };
}

/** Move future inline attrs into the schema's private pass-through slot. */
function toEditorInline(item: JSONContent): JSONContent {
	const nodeType = schema.nodes[item.type ?? ""];
	const type = nodeType?.isInline ? nodeType : undefined;
	const attrs = withExtra(item.attrs, type);
	return {
		...item,
		...(attrs === undefined ? {} : { attrs }),
		...(item.marks
			? {
					marks: item.marks.map((mark) => ({
						...mark,
						attrs: withExtra(mark.attrs, schema.marks[mark.type]),
					})),
				}
			: {}),
		...(item.content ? { content: item.content.map(toEditorInline) } : {}),
	};
}

function fromEditorAttrs(attrs: Record<string, unknown> | undefined) {
	if (!attrs) return undefined;
	const { [INLINE_EXTRA_ATTR]: extra, ...known } = attrs;
	const merged = { ...known, ...(record(extra) ? extra : {}) };
	return Object.keys(merged).length ? merged : undefined;
}

/** Emit the original v1 attr keys, never the editor-only pass-through slot. */
function fromEditorInline(item: JSONContent): JSONContent {
	const attrs = fromEditorAttrs(item.attrs);
	const result = { ...item };
	delete result.attrs;
	if (attrs) result.attrs = attrs;
	if (item.marks)
		result.marks = item.marks.map((mark) => {
			const restored = { ...mark };
			const markAttrs = fromEditorAttrs(mark.attrs);
			delete restored.attrs;
			if (markAttrs) restored.attrs = markAttrs;
			return restored;
		});
	if (item.content) result.content = item.content.map(fromEditorInline);
	return result;
}

/** Reject any original inline shape whose future data cannot be accounted for. */
export function inlinePreservationProblem(
	before: Block[],
	after: Block[],
): string | null {
	const afterById = new Map(after.map((block) => [block.id, block]));
	const refusal =
		"This edit would remove content from a newer version of the app, so it was not saved. Undo the last change to continue.";
	function signatures(block: Block): string[] | null {
		const found: string[] = [];
		function collect(type: InlineType, attrs: unknown): boolean {
			if (attrs === undefined) return true;
			if (!type || !record(attrs) || INLINE_EXTRA_ATTR in attrs) return false;
			for (const [key, value] of Object.entries(attrs)) {
				if (!(key in (type.spec.attrs ?? {})))
					found.push(JSON.stringify([type.name, key, value]));
			}
			return true;
		}
		function visit(item: JSONContent): boolean {
			const type = schema.nodes[item.type ?? ""];
			if (!type) return false;
			if (
				Object.keys(item).some(
					(key) => !["type", "attrs", "text", "marks", "content"].includes(key),
				)
			)
				return false;
			if (
				item.type === "text" &&
				(item.content !== undefined ||
					(record(item.attrs) && Object.keys(item.attrs).length > 0))
			)
				return false;
			if (
				item.type !== "text" &&
				(item.text !== undefined || item.content !== undefined)
			)
				return false;
			if (type.isInline && !collect(type, item.attrs)) return false;
			for (const mark of item.marks ?? []) {
				const markType = schema.marks[mark.type];
				if (
					!markType ||
					Object.keys(mark).some((key) => !["type", "attrs"].includes(key)) ||
					!collect(markType, mark.attrs)
				)
					return false;
			}
			return (item.content ?? []).every(visit);
		}
		return Array.isArray(block.content) &&
			block.content.every((item) => visit(item as JSONContent))
			? found.sort()
			: block.content === undefined
				? found
				: null;
	}
	// Note-wide: Enter or a join can move an owner to another block, so every
	// future attr from a surviving block only has to survive somewhere in the
	// saved note.
	const required = new Map<string, number>();
	for (const block of before) {
		if (!schema.nodes[block.type]?.inlineContent) continue;
		if (!afterById.has(block.id)) continue; // Removing the whole block is an explicit edit.
		const original = signatures(block);
		if (!original) return refusal;
		for (const sig of original) required.set(sig, (required.get(sig) ?? 0) + 1);
	}
	if (!required.size) return null;
	const available = new Map<string, number>();
	for (const block of after) {
		if (!schema.nodes[block.type]?.inlineContent) continue;
		const saved = signatures(block);
		if (!saved) return refusal;
		for (const sig of saved) available.set(sig, (available.get(sig) ?? 0) + 1);
	}
	for (const [sig, count] of required) {
		if ((available.get(sig) ?? 0) < count) return refusal;
	}
	return null;
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
				block.content = node.content.map(
					fromEditorInline,
				) as unknown as JsonValue;
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
			node.content = (block.content as unknown as JSONContent[]).map(
				toEditorInline,
			);
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
	// A column with nothing in it (left by an older block move) opens with one
	// empty paragraph instead of making the whole note unreadable.
	for (const node of root) {
		if (node.type !== "columns") continue;
		for (const column of node.content ?? []) {
			if (column.type === "column" && !column.content?.length) {
				column.content = [{ type: "paragraph", attrs: {} }];
			}
		}
	}
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
