import { expect, it, vi } from "vitest";
import { MemoryHost } from "../../host/memory-host";
import { loadReview, REVIEW_FILE, saveReview } from "./storage";

it("stores atomically and preserves unknown data", async () => {
	const host = new MemoryHost();
	await host.makeFolder(".vaultops");
	await host.writeTextAtomic(
		REVIEW_FILE,
		JSON.stringify({
			version: 1,
			extra: true,
			items: { future: { kind: "future", data: 1 } },
		}),
	);
	const write = vi.spyOn(host, "writeTextAtomic");
	await saveReview(host, { version: 1, items: {} });
	expect(write).toHaveBeenCalledWith(REVIEW_FILE, expect.any(String));
	expect(await loadReview(host)).toMatchObject({
		extra: true,
		items: { future: { kind: "future", data: 1 } },
	});
});
it("copies corrupt content to recovery before replacing it", async () => {
	const host = new MemoryHost();
	expect(await loadReview(host)).toEqual({ version: 1, items: {} });
	await host.makeFolder(".vaultops");
	await host.writeTextAtomic(REVIEW_FILE, "broken");
	const result = await saveReview(host, { version: 1, items: {} });
	expect(result.recoveryPath).toBeDefined();
	expect(await host.readText(result.recoveryPath as string)).toBe("broken");
});
