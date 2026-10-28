import type { JSONContent } from "@tiptap/core";
import { BLOCK_TYPES } from "./blocks";

/**
 * Give every block a unique id before a document reaches the editor: blocks
 * without an id get one, and a repeated id is replaced (the first keeps it).
 * The UniqueID extension only handles blocks created while editing, not the
 * content passed in at load, so loading always goes through here. The save
 * guard stays as the second line of defence.
 * Returns a new document; the input is not changed.
 */
export function ensureUniqueIds(
	doc: JSONContent,
	generateId: () => string = () => crypto.randomUUID(),
	types: readonly string[] = BLOCK_TYPES,
): JSONContent {
	const isBlock = new Set(types);
	const seen = new Set<string>();

	function fresh(): string {
		let id = generateId();
		while (seen.has(id)) id = generateId();
		return id;
	}

	function visit(node: JSONContent): JSONContent {
		let next = node;
		if (node.type !== undefined && isBlock.has(node.type)) {
			const current = node.attrs?.id;
			const usable =
				typeof current === "string" && current !== "" && !seen.has(current);
			const id = usable ? current : fresh();
			seen.add(id);
			if (id !== current) next = { ...node, attrs: { ...node.attrs, id } };
		}
		if (next.content) {
			const content = next.content.map(visit);
			next = { ...next, content };
		}
		return next;
	}

	return visit(doc);
}
