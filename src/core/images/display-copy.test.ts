import { describe, expect, it } from "vitest";
import { copyCacheName, copySize, displayBox, isGif } from "./display-copy";

describe("displayBox", () => {
	it("multiplies by the pixel ratio, caps it at 2 and rounds the width up", () => {
		expect(displayBox({ width: 700, height: 200 }, 1)).toEqual({
			width: 768,
			height: 200,
		});
		expect(displayBox({ width: 700, height: 200 }, 2)).toEqual({
			width: 1536,
			height: 400,
		});
		expect(displayBox({ width: 700, height: 200 }, 3)).toEqual(
			displayBox({ width: 700, height: 200 }, 2),
		);
	});

	it("treats a missing or odd ratio as 1", () => {
		expect(displayBox({ width: 256, height: 100 }, 0)).toEqual({
			width: 256,
			height: 100,
		});
		expect(displayBox({ width: 0, height: 0 }, Number.NaN)).toEqual({
			width: 256,
			height: 1,
		});
	});
});

describe("copySize", () => {
	it("scales down until the copy just covers the box", () => {
		// A wide banner: the width decides.
		expect(
			copySize({ width: 4000, height: 3000 }, { width: 1536, height: 400 }),
		).toEqual({ width: 1536, height: 1152 });
		// A tall box: the height decides.
		expect(
			copySize({ width: 4000, height: 1000 }, { width: 512, height: 400 }),
		).toEqual({ width: 1600, height: 400 });
	});

	it("never makes a copy larger than the original", () => {
		expect(
			copySize({ width: 800, height: 600 }, { width: 1536, height: 400 }),
		).toEqual({ width: 800, height: 600 });
	});
});

describe("copyCacheName", () => {
	const source = {
		path: "attachments/photo.png",
		byteSize: 1000,
		contentHash: "ab".repeat(32),
	};
	const box = { width: 1536, height: 400 };

	it("stays the same for the same original and box", () => {
		expect(copyCacheName(source, box)).toBe(copyCacheName({ ...source }, box));
		expect(copyCacheName(source, box)).toMatch(
			/^images\/[0-9a-f]{8}-[0-9a-f]{32}-1000-1536x400$/,
		);
	});

	it("changes when the original's path, size or content changes, or the box does", () => {
		const name = copyCacheName(source, box);
		expect(
			copyCacheName({ ...source, path: "attachments/b.png" }, box),
		).not.toBe(name);
		expect(copyCacheName({ ...source, byteSize: 1001 }, box)).not.toBe(name);
		expect(
			copyCacheName({ ...source, contentHash: "cd".repeat(32) }, box),
		).not.toBe(name);
		expect(copyCacheName(source, { width: 768, height: 400 })).not.toBe(name);
	});
});

describe("isGif", () => {
	it("recognises GIF bytes only", () => {
		expect(isGif(new TextEncoder().encode("GIF89a..."))).toBe(true);
		expect(isGif(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(false);
		expect(isGif(new Uint8Array())).toBe(false);
	});
});
