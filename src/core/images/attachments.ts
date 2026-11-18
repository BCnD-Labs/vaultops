/**
 * Images in notes: the name a pasted or dropped image is stored under in
 * `attachments/`, and the widths an image block snaps to.
 */

const TYPES: Readonly<Record<string, string>> = {
	"image/png": "png",
	"image/jpeg": "jpg",
	"image/gif": "gif",
	"image/webp": "webp",
};
const EXTENSION = /\.(png|jpe?g|gif|webp)$/i;

/**
 * The file name for a pasted or dropped image: its own name with anything
 * other than letters, digits, spaces, `.`, `_` and `-` made a `-` (it travels
 * to Rust in a header, so plain ASCII only, and never starts with a dot), and
 * the extension of its type. Null when it is not a PNG, JPEG, GIF or WebP.
 */
export function attachmentName(name: string, type: string): string | null {
	const ext = type
		? TYPES[type.toLowerCase()]
		: EXTENSION.exec(name)?.[1]?.toLowerCase();
	if (!ext) return null;
	const stem = name
		.replace(EXTENSION, "")
		.replace(/[^A-Za-z0-9 ._-]+/g, "-")
		.replace(/^[\s.-]+|[\s.]+$/g, "")
		.slice(0, 100);
	return `${stem || "image"}.${ext}`;
}

/** The widths an image block can have, as a fraction of the column. */
export const IMAGE_WIDTHS = [0.25, 0.5, 0.75, 1] as const;

/** The nearest of `IMAGE_WIDTHS` to a dragged width. */
export function snapWidth(fraction: number): number {
	return IMAGE_WIDTHS.reduce<number>(
		(best, width) =>
			Math.abs(width - fraction) < Math.abs(best - fraction) ? width : best,
		1,
	);
}

/** A stored width, or 1 (the whole column) when it is missing or makes no sense. */
export function imageWidth(value: unknown): number {
	return typeof value === "number" && value > 0 && value <= 1 ? value : 1;
}
