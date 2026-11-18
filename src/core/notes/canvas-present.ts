import type { Block } from "../note-format";
import { FRAME_SIZE } from "./canvas-arrange";
import { canvasNodes, numberAttr } from "./canvas-ops";
import { blockPosition } from "./canvas-position";

export function presentationFrames(blocks: Block[]) {
	return canvasNodes(blocks)
		.filter((block) => block.type === "group")
		.map((block) => {
			const slide = numberAttr(block, "slide", 0);
			return {
				slide: Number.isSafeInteger(slide) && slide > 0 ? slide : Infinity,
				...blockPosition(block),
				width: Math.max(1, numberAttr(block, "w", FRAME_SIZE.w)),
				height: Math.max(1, numberAttr(block, "h", FRAME_SIZE.h)),
			};
		})
		.sort((a, b) => a.slide - b.slide || a.y - b.y || a.x - b.x);
}
