/**
 * Block types that exist only on a canvas. They are never moved into a note and
 * a note file that contains one is refused at save time (`canvas-only-in-note`).
 */
export const CANVAS_ONLY_TYPES = [
	"shape",
	"sticky",
	"label",
	"group",
	"connector",
	"embed",
] as const;

export type CanvasOnlyType = (typeof CANVAS_ONLY_TYPES)[number];

export function isCanvasOnly(type: string): boolean {
	return (CANVAS_ONLY_TYPES as readonly string[]).includes(type);
}
