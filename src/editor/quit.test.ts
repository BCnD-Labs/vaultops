import { describe, expect, it, vi } from "vitest";
import { MemoryHost } from "../host/memory-host";
import { createQuitGuard } from "./quit";

describe("createQuitGuard", () => {
	it("lets the window close once everything is saved", async () => {
		const flush = vi.fn().mockResolvedValue(true);
		expect(await createQuitGuard(flush)()).toBe(true);
		expect(flush).toHaveBeenCalledTimes(1);
	});

	it("keeps the window open when the save fails, then closes on the second ask", async () => {
		const guard = createQuitGuard(vi.fn().mockResolvedValue(false));
		expect(await guard()).toBe(false);
		expect(await guard()).toBe(true);
	});

	it("keeps a copy of the unsaved text before closing on the second ask", async () => {
		const keepCopy = vi.fn().mockResolvedValue(true);
		const guard = createQuitGuard(vi.fn().mockResolvedValue(false), keepCopy);
		expect(await guard()).toBe(false);
		expect(keepCopy).not.toHaveBeenCalled();
		expect(await guard()).toBe(true);
		expect(keepCopy).toHaveBeenCalledTimes(1);
	});

	it("stays open when the copy can't be kept, and closes on the third ask", async () => {
		const keepCopy = vi.fn().mockResolvedValue(false);
		const guard = createQuitGuard(vi.fn().mockResolvedValue(false), keepCopy);
		expect(await guard()).toBe(false);
		expect(await guard()).toBe(false);
		expect(await guard()).toBe(true);
	});

	it("treats a throwing keepCopy as not kept", async () => {
		const guard = createQuitGuard(
			vi.fn().mockResolvedValue(false),
			vi.fn().mockRejectedValue(new Error("x")),
		);
		expect(await guard()).toBe(false);
		expect(await guard()).toBe(false);
		expect(await guard()).toBe(true);
	});

	it("does not keep a copy when the save worked", async () => {
		const keepCopy = vi.fn().mockResolvedValue(true);
		const guard = createQuitGuard(vi.fn().mockResolvedValue(true), keepCopy);
		expect(await guard()).toBe(true);
		expect(keepCopy).not.toHaveBeenCalled();
	});

	it("treats a throwing flush as a failed save", async () => {
		const guard = createQuitGuard(vi.fn().mockRejectedValue(new Error("x")));
		expect(await guard()).toBe(false);
	});

	it("works through the host's close request", async () => {
		const host = new MemoryHost();
		const flush = vi.fn().mockResolvedValue(true);
		const off = await host.onCloseRequested(createQuitGuard(flush));
		expect(await host.simulateClose()).toBe(true);
		expect(flush).toHaveBeenCalledTimes(1);
		off();
		expect(await host.simulateClose()).toBe(true);
		expect(flush).toHaveBeenCalledTimes(1);
	});
});
