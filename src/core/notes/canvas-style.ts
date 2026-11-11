import type { Block } from "../note-format";
import { attrsOf, patchAttrs } from "./canvas-ops";

/** The outlines a shape can have; `rectangle` is the default and is left out of the file. */
export const SHAPE_KINDS = [
	"rectangle",
	"rounded",
	"ellipse",
	"diamond",
] as const;
export type ShapeKind = (typeof SHAPE_KINDS)[number];

/** Text sizes for sticky notes, shapes and labels; `m` is the default and is left out. */
export const TEXT_SIZES = ["s", "m", "l"] as const;
export type TextSize = (typeof TEXT_SIZES)[number];

export function isShapeKind(value: unknown): value is ShapeKind {
	return SHAPE_KINDS.some((kind) => kind === value);
}

export function isTextSize(value: unknown): value is TextSize {
	return TEXT_SIZES.some((size) => size === value);
}

export function blockShape(block: Block): ShapeKind {
	const value = attrsOf(block).shape;
	return isShapeKind(value) ? value : "rectangle";
}

/** Whether the block's text has a size: sticky notes, shapes and labels. */
export function hasTextSize(block: Block): boolean {
	return (
		block.parent === null &&
		(block.type === "sticky" ||
			block.type === "shape" ||
			block.type === "label")
	);
}

export function blockTextSize(block: Block): TextSize {
	const value = attrsOf(block).size;
	return isTextSize(value) ? value : "m";
}

function onlyRoots(
	blocks: Block[],
	ids: string[],
	allowed: (block: Block) => boolean,
	message: string,
): void {
	for (const id of ids) {
		const block = blocks.find((b) => b.id === id && b.parent === null);
		if (!block) throw new Error("This item is no longer on the canvas.");
		if (!allowed(block)) throw new Error(message);
	}
}

/**
 * Change the outline of shapes. Refuses anything that is not a shape before
 * changing anything, so one wrong id cannot half-apply the change.
 */
export function setShapeKind(
	blocks: Block[],
	ids: string[],
	kind: ShapeKind,
): Block[] {
	if (!isShapeKind(kind)) throw new Error("That is not a shape.");
	onlyRoots(
		blocks,
		ids,
		(block) => block.type === "shape",
		"Only shapes have an outline to change.",
	);
	let next = blocks;
	for (const id of ids)
		next = patchAttrs(next, id, {
			shape: kind === "rectangle" ? undefined : kind,
		});
	return next;
}

/** Change the text size of sticky notes, shapes and labels. */
export function setTextSize(
	blocks: Block[],
	ids: string[],
	size: TextSize,
): Block[] {
	if (!isTextSize(size)) throw new Error("That is not a text size.");
	onlyRoots(
		blocks,
		ids,
		hasTextSize,
		"Only sticky notes, shapes and labels have a text size.",
	);
	let next = blocks;
	for (const id of ids)
		next = patchAttrs(next, id, { size: size === "m" ? undefined : size });
	return next;
}
