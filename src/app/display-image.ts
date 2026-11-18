import {
	copyCacheName,
	copySize,
	isGif,
	type Size,
} from "../core/images/display-copy";
import type { ImageSource } from "../editor/image-block";
import type { Host } from "../host/host";

/** Turns an original's bytes into a smaller copy; null when the original is already small enough. */
export type MakeCopy = (bytes: ArrayBuffer, box: Size) => Promise<Blob | null>;

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", bytes);
	return [...new Uint8Array(digest)]
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

/**
 * The bytes to show for the image at `path` (under attachments/) filling `box`
 * (device pixels, see `displayBox`): a cached display copy when there is one,
 * otherwise a copy made now and stored in the cache, otherwise the original.
 * Only reading the original can fail; anything else falls back to it silently.
 */
export async function displayImage(
	host: Host,
	path: string,
	box: Size,
	makeCopy: MakeCopy = makeCanvasCopy,
): Promise<Blob> {
	const original = await host.readCover(path);
	const fallback = new Blob([original]);
	try {
		if (isGif(new Uint8Array(original))) return fallback;
		const contentHash = await sha256Hex(original);
		const name = copyCacheName(
			{ path, byteSize: original.byteLength, contentHash },
			box,
		);
		const cached = await host.readCache(name).catch(() => null);
		if (cached) return new Blob([cached]);
		const copy = await makeCopy(original, box);
		if (!copy || copy.size >= original.byteLength) return fallback;
		// A read-only vault or a full disk only means the copy is made again next time.
		await host.writeCache(name, await copy.arrayBuffer()).catch(() => {});
		return copy;
	} catch {
		return fallback;
	}
}

/** What a note's image blocks use: display copies, and imports into attachments/. */
export function imageSource(host: Host): ImageSource {
	return {
		show: (path, box) => displayImage(host, path, box),
		choose: () => host.chooseImage(),
		store: (name, bytes) => host.importAttachment(name, bytes),
	};
}

const QUALITY = 0.82;

function encode(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
	return new Promise((resolve) => canvas.toBlob(resolve, type, QUALITY));
}

function hasTransparency(context: CanvasRenderingContext2D, size: Size) {
	const { data } = context.getImageData(0, 0, size.width, size.height);
	for (let i = 3; i < data.length; i += 4) if (data[i] !== 255) return true;
	return false;
}

/**
 * Decode in the webview, draw at the copy's size and encode as WebP. Where the
 * webview can't write WebP (Safari), it is PNG for images with transparency
 * and JPEG for the rest.
 */
export async function makeCanvasCopy(
	bytes: ArrayBuffer,
	box: Size,
): Promise<Blob | null> {
	const bitmap = await createImageBitmap(new Blob([bytes]));
	try {
		const size = copySize(bitmap, box);
		if (size.width >= bitmap.width) return null;
		const canvas = document.createElement("canvas");
		canvas.width = size.width;
		canvas.height = size.height;
		const context = canvas.getContext("2d");
		if (!context) return null;
		context.imageSmoothingQuality = "high";
		context.drawImage(bitmap, 0, 0, size.width, size.height);
		const webp = await encode(canvas, "image/webp");
		if (webp?.type === "image/webp") return webp;
		return encode(
			canvas,
			hasTransparency(context, size) ? "image/png" : "image/jpeg",
		);
	} finally {
		bitmap.close();
	}
}
