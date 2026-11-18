import type { TaggedRow } from "./tags";

/** One level of a nested tag such as `work/clients/acme`. */
export interface TagNode {
	/** This level's own name (`clients`). */
	name: string;
	/** The whole tag up to this level (`work/clients`). */
	path: string;
	/** Notes carrying this tag or any tag below it, each note once. */
	count: number;
	children: TagNode[];
}

/** The tag as levels: `work/clients` is `["work", "clients"]`. */
export function tagSegments(tag: string): string[] {
	return tag.split("/").filter((part) => part !== "");
}

/** True when `tag` is `parent` or sits below it (ignoring capital letters). */
export function isUnderTag(tag: string, parent: string): boolean {
	const t = tag.toLowerCase();
	const p = parent.toLowerCase();
	return t === p || t.startsWith(`${p}/`);
}

/**
 * Every tag in use as a tree, with counts. A parent counts the notes tagged
 * with it or any descendant, so a note with `work/a` and `work/b` is one
 * note under `work`. Levels match ignoring capitals; the first spelling seen
 * is shown. Siblings are sorted by name.
 */
export function buildTagTree(rows: TaggedRow[]): TagNode[] {
	interface Slot {
		node: TagNode;
		notes: Set<number>;
	}
	const slots = new Map<string, Slot>();
	const roots: TagNode[] = [];
	rows.forEach((row, index) => {
		for (const tag of row.tags) {
			const parts = tagSegments(tag);
			for (let depth = 1; depth <= parts.length; depth++) {
				const path = parts.slice(0, depth).join("/");
				const key = path.toLowerCase();
				let slot = slots.get(key);
				if (!slot) {
					const node: TagNode = {
						name: parts[depth - 1] ?? path,
						path,
						count: 0,
						children: [],
					};
					slot = { node, notes: new Set() };
					slots.set(key, slot);
					const parent = slots.get(
						parts
							.slice(0, depth - 1)
							.join("/")
							.toLowerCase(),
					);
					(parent ? parent.node.children : roots).push(node);
				}
				slot.notes.add(index);
				slot.node.count = slot.notes.size;
			}
		}
	});
	const sort = (nodes: TagNode[]) => {
		nodes.sort((a, b) =>
			a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
		);
		for (const node of nodes) sort(node.children);
	};
	sort(roots);
	return roots;
}
