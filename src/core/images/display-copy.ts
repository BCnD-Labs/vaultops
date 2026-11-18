/**
 * Display copies: the smallest copy of an image that still looks sharp where
 * it is shown. The original in `attachments/` is never changed; copies live in
 * the vault's cache (`.vaultops/cache/images/`) and can be rebuilt any time.
 */

export interface Size {
	width: number;
	height: number;
}

/** Copies are never made for more than 2 device pixels per CSS pixel. */
export const MAX_PIXEL_RATIO = 2;

/** Requested widths are rounded up to this step, so resizing the window a little reuses the same copy. */
export const WIDTH_STEP = 256;

/**
 * The box, in device pixels, a copy must fill: the largest size the image is
 * shown at (CSS pixels) times the pixel ratio (at most 2), the width rounded up
 * to `WIDTH_STEP`.
 */
export function displayBox(shown: Size, pixelRatio: number): Size {
	const ratio = Math.min(Math.max(pixelRatio || 1, 1), MAX_PIXEL_RATIO);
	const width = Math.ceil((Math.max(shown.width, 1) * ratio) / WIDTH_STEP);
	return {
		width: width * WIDTH_STEP,
		height: Math.ceil(Math.max(shown.height, 1) * ratio),
	};
}

/**
 * The size of the copy: the original scaled down until it just covers `box`
 * (so a cropped banner and a whole image both stay sharp), never larger than
 * the original.
 */
export function copySize(natural: Size, box: Size): Size {
	const scale = Math.min(
		1,
		Math.max(box.width / natural.width, box.height / natural.height),
	);
	return {
		width: Math.max(1, Math.round(natural.width * scale)),
		height: Math.max(1, Math.round(natural.height * scale)),
	};
}

/** Short, stable hex hash of a string (FNV-1a, 32 bits): enough to keep paths apart in a file name. */
function fnv1a(text: string): string {
	let hash = 0x811c9dc5;
	for (const byte of new TextEncoder().encode(text)) {
		hash = Math.imul(hash ^ byte, 0x01000193);
	}
	return (hash >>> 0).toString(16).padStart(8, "0");
}

export interface ImageSource {
	/** Vault-relative path of the original. */
	path: string;
	byteSize: number;
	/** Hex hash of the original's bytes (SHA-256). */
	contentHash: string;
}

/**
 * Where a copy is kept, relative to `.vaultops/cache/`. It changes whenever the
 * original's path, size or content changes, or a different box is asked for,
 * so a stale copy is never shown.
 */
export function copyCacheName(source: ImageSource, box: Size): string {
	const content = source.contentHash.slice(0, 32);
	return `images/${fnv1a(source.path)}-${content}-${source.byteSize}-${box.width}x${box.height}`;
}

/** GIFs (which may be animated) are shown as they are, so an animation keeps playing. */
export function isGif(bytes: Uint8Array): boolean {
	return bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46; // "GIF"
}
