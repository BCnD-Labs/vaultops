import { expect, it, vi } from "vitest";
import { MemoryHost } from "../../host/memory-host";
import { loadReview, REVIEW_FILE, saveReview } from "./storage";

it("stores atomically, keeps unknown data it loaded, and lets items be removed", async () => {
	const host = new MemoryHost();
	await host.makeFolder(".vaultops");
	await host.writeTextAtomic(
		REVIEW_FILE,
		JSON.stringify({
			version: 1,
			extra: true,
			items: {
				future: { kind: "future", data: 1 },
				gone: { id: "gone", kind: "flashcard", due: "2026-11-18" },
			},
		}),
	);
	const loaded = await loadReview(host);
	const { gone: _gone, ...items } = loaded.items;
	const write = vi.spyOn(host, "writeTextAtomic");
	await saveReview(host, { ...loaded, items });
	expect(write).toHaveBeenCalledWith(REVIEW_FILE, expect.any(String));
	const saved = await loadReview(host);
	expect(saved).toMatchObject({
		extra: true,
		items: { future: { kind: "future", data: 1 } },
	});
	expect(saved.items.gone).toBeUndefined();
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
