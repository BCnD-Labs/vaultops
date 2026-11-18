import { beforeEach, describe, expect, it, vi } from "vitest";
import { HostError } from "../host/host";
import { MemoryHost } from "../host/memory-host";
import { readOnlyHost } from "../host/read-only-host";
import { displayImage, type MakeCopy } from "./display-image";

const box = { width: 768, height: 200 };
const original = new Uint8Array(1000).fill(7);
const copyBytes = new Uint8Array([1, 2, 3]);

async function bytesOf(blob: Blob) {
	return [...new Uint8Array(await blob.arrayBuffer())];
}

async function cachedNames(host: MemoryHost) {
	return (await host.list(".vaultops/cache/images")).map((e) => e.name);
}

describe("displayImage", () => {
	let host: MemoryHost;
	let path: string;
	let makeCopy: ReturnType<typeof vi.fn<MakeCopy>>;

	beforeEach(async () => {
		host = new MemoryHost();
		host.nextCover = { name: "photo.png", bytes: original };
		path = (await host.chooseCover()) as string;
		makeCopy = vi.fn<MakeCopy>(async () => new Blob([copyBytes]));
	});

	it("makes the copy on the first view and reads it from the cache after", async () => {
		expect(
			await bytesOf(await displayImage(host, path, box, makeCopy)),
		).toEqual([...copyBytes]);
		expect(await cachedNames(host)).toHaveLength(1);
		expect(
			await bytesOf(await displayImage(host, path, box, makeCopy)),
		).toEqual([...copyBytes]);
		expect(makeCopy).toHaveBeenCalledTimes(1);
	});

	it("makes a new copy when the original changes", async () => {
		await displayImage(host, path, box, makeCopy);
		await host.writeTextAtomic(path, "a different image");
		await displayImage(host, path, box, makeCopy);
		expect(makeCopy).toHaveBeenCalledTimes(2);
		expect(await cachedNames(host)).toHaveLength(2);
	});

	it("shows the original when making the copy fails", async () => {
		makeCopy.mockRejectedValue(new Error("cannot decode"));
		const blob = await displayImage(host, path, box, makeCopy);
		expect(await bytesOf(blob)).toEqual([...original]);
		expect(await host.kindOf(".vaultops/cache")).toBeNull();
	});

	it("shows the original when no smaller copy is needed or the copy is not smaller", async () => {
		makeCopy.mockResolvedValueOnce(null);
		expect(
			await bytesOf(await displayImage(host, path, box, makeCopy)),
		).toEqual([...original]);
		makeCopy.mockResolvedValueOnce(new Blob([new Uint8Array(2000)]));
		expect(
			await bytesOf(await displayImage(host, path, box, makeCopy)),
		).toEqual([...original]);
		expect(await host.kindOf(".vaultops/cache")).toBeNull();
	});

	it("keeps GIFs as they are so animations play", async () => {
		const gif = new TextEncoder().encode("GIF89a and frames");
		host.nextCover = { name: "moving.gif", bytes: gif };
		const gifPath = (await host.chooseCover()) as string;
		const blob = await displayImage(host, gifPath, box, makeCopy);
		expect(await bytesOf(blob)).toEqual([...gif]);
		expect(makeCopy).not.toHaveBeenCalled();
	});

	it("still shows the copy when the cache can't be read or written", async () => {
		const blocked = readOnlyHost(host);
		blocked.readCache = () => Promise.reject(new HostError("io", "broken"));
		const blob = await displayImage(blocked, path, box, makeCopy);
		expect(await bytesOf(blob)).toEqual([...copyBytes]);
		expect(await host.kindOf(".vaultops/cache")).toBeNull();
	});

	it("fails only when the original itself can't be read", async () => {
		await expect(
			displayImage(host, "attachments/missing.png", box, makeCopy),
		).rejects.toBeInstanceOf(HostError);
	});
});
