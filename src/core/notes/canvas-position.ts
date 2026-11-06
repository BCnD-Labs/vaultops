import type { Host } from "../../host/host";
import type { Block } from "../note-format";
import { saveCanvasEdit } from "./canvas-edit";
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

/** The caller supplies the text it displayed. A changed file is never overwritten. */
export async function saveCanvasPosition(
	host: Host,
	path: string,
	baseText: string,
	blockId: string,
	position: { x: number; y: number },
): Promise<string> {
	return saveCanvasEdit(
		host,
		path,
		baseText,
		(blocks) => {
			if (!blocks.some((b) => b.id === blockId && b.parent === null))
				throw new Error("This card is no longer on the canvas.");
			return setPositions(blocks, { [blockId]: position });
		},
		"moving a card",
	);
}
