import type { Block } from "../note-format";
import { setPositions } from "./canvas-ops";

export function canvasRoots(blocks: Block[]): Block[] {
	return blocks.filter((block) => block.parent === null && !!block.id);
}

export function blockPosition(block: Block): { x: number; y: number } {
	const attrs = block.attrs;
	if (!attrs || typeof attrs !== "object" || Array.isArray(attrs))
		return { x: 0, y: 0 };
	return {
		x: typeof attrs.x === "number" && Number.isFinite(attrs.x) ? attrs.x : 0,
		y: typeof attrs.y === "number" && Number.isFinite(attrs.y) ? attrs.y : 0,
	};
}

export function moveCanvasCard(
	blocks: Block[],
	blockId: string,
	position: { x: number; y: number },
): Block[] {
	if (!blocks.some((block) => block.id === blockId && block.parent === null))
		throw new Error("This card is no longer on the canvas.");
	return setPositions(blocks, { [blockId]: position });
}
