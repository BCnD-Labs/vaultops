import { describe, expect, it } from "vitest";
import { attachmentName, imageWidth, snapWidth } from "./attachments";

describe("attachmentName", () => {
	it("keeps a plain name and takes the extension from the type", () => {
		expect(attachmentName("image.png", "image/png")).toBe("image.png");
		expect(attachmentName("Photo.JPG", "image/jpeg")).toBe("Photo.jpg");
		expect(attachmentName("scan.png", "image/webp")).toBe("scan.webp");
		expect(attachmentName("a.gif", "")).toBe("a.gif");
	});

	it("makes a name that is safe in a header and inside attachments/", () => {
		expect(attachmentName("../../etc/passwd.png", "image/png")).toBe(
			"etc-passwd.png",
		);
		expect(attachmentName(".hidden.png", "image/png")).toBe("hidden.png");
		expect(attachmentName("Café, été.png", "image/png")).toBe("Caf- -t-.png");
		expect(attachmentName("", "image/png")).toBe("image.png");
		expect(attachmentName("x".repeat(300), "image/png")).toBe(
			`${"x".repeat(100)}.png`,
		);
	});

	it("refuses anything that is not a PNG, JPEG, GIF or WebP", () => {
		expect(attachmentName("a.svg", "image/svg+xml")).toBeNull();
		expect(attachmentName("a.png", "image/heic")).toBeNull();
		expect(attachmentName("notes.txt", "")).toBeNull();
	});
});

describe("image widths", () => {
	it("snaps a dragged width to a quarter of the column", () => {
		expect([0.05, 0.4, 0.62, 0.8, 1.3].map(snapWidth)).toEqual([
			0.25, 0.5, 0.5, 0.75, 1,
		]);
	});

	it("reads a stored width, falling back to the whole column", () => {
		expect(imageWidth(0.5)).toBe(0.5);
		for (const bad of [null, undefined, 0, 2, "0.5"])
			expect(imageWidth(bad)).toBe(1);
	});
});
