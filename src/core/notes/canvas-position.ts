import type { Host } from "../../host/host";
import { type Block, parseNote, prepareSave } from "../note-format";

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
	if (!Number.isFinite(position.x) || !Number.isFinite(position.y))
		throw new Error("Canvas coordinates must be finite numbers.");
	const parsed = parseNote(baseText);
	if (parsed.note?.header.kind !== "canvas" || parsed.problems.length)
		throw new Error("This canvas cannot be edited safely.");
	const index = parsed.note.blocks.findIndex(
		(block) => block.id === blockId && block.parent === null,
	);
	if (index < 0) throw new Error("This card is no longer on the canvas.");
	const block = parsed.note.blocks[index] as Block;
	const attrs = block.attrs;
	parsed.note.blocks[index] = {
		...block,
		attrs: {
			...(attrs && typeof attrs === "object" && !Array.isArray(attrs)
				? attrs
				: {}),
			...position,
		},
	};
	const saved = prepareSave(parsed.note);
	if (!saved.ok) throw new Error("The canvas did not pass the save check.");
	if ((await host.readText(path)) !== baseText)
		throw new Error(
			"The canvas changed on disk. Reload it before moving a card.",
		);
	await host.writeTextAtomic(path, saved.text);
	return saved.text;
}
