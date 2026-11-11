import type { Block } from "../note-format";
import type { Rect } from "./canvas-arrange";
import { canvasNodes } from "./canvas-ops";

/**
 * How an item moves in the stack of overlapping items. On a canvas the order of
 * the root lines in the file is the stacking order: later lines are drawn on
 * top. No attribute is stored, so nothing about the file format changes.
 */
export type Order = "front" | "forward" | "backward" | "back";

/** Groups are frames drawn behind everything and connectors are lines, so neither is stacked. */
function stacked(block: Block): boolean {
	return block.type !== "group" && block.type !== "connector";
}

function overlaps(a: Rect | undefined, b: Rect | undefined): boolean {
	// Without both boxes we cannot tell, so the neighbour counts as overlapping.
	if (!a || !b) return true;
	return (
		a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
	);
}

/** A root and everything inside it. */
function subtreeIds(blocks: Block[], rootId: string): Set<string> {
	const inside = new Set([rootId]);
	// A hand-edited file may list a child before its parent, so repeat until
	// nothing more is added.
	let grew = true;
	while (grew) {
		grew = false;
		for (const block of blocks)
			if (
				block.id &&
				block.parent !== null &&
				inside.has(block.parent) &&
				!inside.has(block.id)
			) {
				inside.add(block.id);
				grew = true;
			}
	}
	return inside;
}

/**
 * Move items forward or backward in the stack. `front` and `back` go past
 * everything; `forward` and `backward` go past the next item they overlap
 * (judged from `boxes`, or the next item at all when no boxes are given).
 * Only the places the items already occupy in the file are reused, so every
 * other line stays where it was, and nothing changes when the order is already
 * right. Refuses anything that is not a card, sticky note, shape or label.
 */
export function reorderItems(
	blocks: Block[],
	ids: string[],
	how: Order,
	boxes: { [id: string]: Rect } = {},
): Block[] {
	const wanted = new Set(ids);
	for (const id of wanted) {
		const block = blocks.find((b) => b.id === id && b.parent === null);
		if (!block) throw new Error("This item is no longer on the canvas.");
		if (!stacked(block))
			throw new Error("Only cards, sticky notes, shapes and labels stack.");
	}
	const before = canvasNodes(blocks)
		.filter(stacked)
		.map((b) => b.id as string);
	const picked = (id: string) => wanted.has(id);
	let order = [...before];

	if (how === "front")
		order = [...order.filter((id) => !picked(id)), ...order.filter(picked)];
	else if (how === "back")
		order = [...order.filter(picked), ...order.filter((id) => !picked(id))];
	else if (how === "forward") {
		for (let i = order.length - 1; i >= 0; i--) {
			const id = order[i] as string;
			if (!picked(id)) continue;
			for (let j = i + 1; j < order.length; j++) {
				const other = order[j] as string;
				if (picked(other)) break;
				if (!overlaps(boxes[id], boxes[other])) continue;
				order.splice(i, 1);
				order.splice(j, 0, id);
				break;
			}
		}
	} else {
		for (let i = 0; i < order.length; i++) {
			const id = order[i] as string;
			if (!picked(id)) continue;
			for (let j = i - 1; j >= 0; j--) {
				const other = order[j] as string;
				if (picked(other)) break;
				if (!overlaps(boxes[id], boxes[other])) continue;
				order.splice(i, 1);
				order.splice(j, 0, id);
				break;
			}
		}
	}
	if (order.every((id, i) => id === before[i])) return blocks;

	// Gather each stacked item with its children, then refill the same slots in
	// the new order.
	const owner = new Map<string, string>();
	for (const id of before)
		for (const member of subtreeIds(blocks, id)) owner.set(member, id);
	const parts = new Map<string, Block[]>();
	const slots = new Set<number>();
	blocks.forEach((block, index) => {
		const root = block.id ? owner.get(block.id) : undefined;
		if (!root) return;
		slots.add(index);
		parts.set(root, [...(parts.get(root) ?? []), block]);
	});
	const refill = order.flatMap((id) => parts.get(id) ?? []);
	let next = 0;
	return blocks.map((block, index) =>
		slots.has(index) ? (refill[next++] as Block) : block,
	);
}
