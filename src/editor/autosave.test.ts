import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAutosave } from "./autosave";
import type { SaveOutcome } from "./note-io";

const doc = (text: string) => ({
	type: "doc",
	content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function setup(results: SaveOutcome[] = []) {
	const saved: unknown[] = [];
	const save = vi.fn(async (d: unknown) => {
		saved.push(d);
		return results.shift() ?? { ok: true as const, note: {} as never };
	});
	const auto = createAutosave({ save });
	return { auto, save, saved };
}

describe("createAutosave", () => {
	it("saves once, 650 ms after the last edit", async () => {
		const { auto, save } = setup();
		auto.change(doc("a"));
		await vi.advanceTimersByTimeAsync(600);
		auto.change(doc("ab"));
		await vi.advanceTimersByTimeAsync(600);
		expect(save).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(100);
		expect(save).toHaveBeenCalledTimes(1);
		expect(save).toHaveBeenCalledWith(doc("ab"));
		expect(auto.getState().kind).toBe("saved");
	});

	it("reports dirty while waiting and saving while writing", async () => {
		const states: string[] = [];
		let release: () => void = () => {};
		const auto = createAutosave({
			save: () =>
				new Promise((resolve) => {
					release = () => resolve({ ok: true, note: {} as never });
				}),
		});
		auto.subscribe((s) => states.push(s.kind));
		auto.change(doc("a"));
		await vi.advanceTimersByTimeAsync(650);
		release();
		await vi.advanceTimersByTimeAsync(0);
		expect(states).toEqual(["dirty", "saving", "saved"]);
	});

	it("flush saves right away and resolves true", async () => {
		const { auto, save } = setup();
		auto.change(doc("a"));
		expect(await auto.flush()).toBe(true);
		expect(save).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(2000);
		expect(save).toHaveBeenCalledTimes(1);
	});

	it("flush with nothing unsaved does not write", async () => {
		const { auto, save } = setup();
		expect(await auto.flush()).toBe(true);
		expect(save).not.toHaveBeenCalled();
	});

	it("keeps the edit after a failure and retries by itself", async () => {
		const { auto, save } = setup([{ ok: false, message: "disk full" }]);
		auto.change(doc("a"));
		await vi.advanceTimersByTimeAsync(650);
		expect(auto.getState()).toEqual({ kind: "failed", reason: "disk full" });
		await vi.advanceTimersByTimeAsync(2000);
		expect(save).toHaveBeenCalledTimes(2);
		expect(save).toHaveBeenLastCalledWith(doc("a"));
		expect(auto.getState().kind).toBe("saved");
	});

	it("flush after a failure reports false; retry saves and reports true", async () => {
		const { auto } = setup([{ ok: false, message: "locked" }]);
		auto.change(doc("a"));
		expect(await auto.flush()).toBe(false);
		expect(auto.getState().kind).toBe("failed");
		expect(await auto.retry()).toBe(true);
		expect(auto.getState().kind).toBe("saved");
	});

	it("a thrown save counts as a failure, not a lost edit", async () => {
		const save = vi
			.fn()
			.mockRejectedValueOnce(new Error("boom"))
			.mockResolvedValue({ ok: true, note: {} });
		const auto = createAutosave({ save });
		auto.change(doc("a"));
		expect(await auto.flush()).toBe(false);
		expect(auto.getState()).toEqual({ kind: "failed", reason: "boom" });
		expect(await auto.retry()).toBe(true);
	});

	it("an edit made during a save is saved next, never skipped", async () => {
		const { auto, saved } = setup();
		let firstStarted = false;
		const slow = createAutosave({
			save: async (d) => {
				saved.push(d);
				if (!firstStarted) {
					firstStarted = true;
					slow.change(doc("second"));
				}
				return { ok: true, note: {} as never };
			},
		});
		slow.change(doc("first"));
		expect(await slow.flush()).toBe(true);
		expect(saved).toEqual([doc("first"), doc("second")]);
		expect(slow.getState().kind).toBe("saved");
		auto.dispose();
	});

	it("a newer edit replaces the failed one", async () => {
		const { auto, saved } = setup([{ ok: false, message: "no" }]);
		auto.change(doc("a"));
		await auto.flush();
		auto.change(doc("b"));
		expect(await auto.flush()).toBe(true);
		expect(saved).toEqual([doc("a"), doc("b")]);
	});

	it("backs off between retries and keeps going", async () => {
		const fails: SaveOutcome[] = Array.from({ length: 6 }, () => ({
			ok: false as const,
			message: "x",
		}));
		const { auto, save } = setup(fails);
		auto.change(doc("a"));
		await vi.advanceTimersByTimeAsync(650); // try 1
		await vi.advanceTimersByTimeAsync(2000); // try 2
		await vi.advanceTimersByTimeAsync(5000); // try 3
		await vi.advanceTimersByTimeAsync(15000); // try 4
		expect(save).toHaveBeenCalledTimes(4);
		await vi.advanceTimersByTimeAsync(30000); // try 5
		await vi.advanceTimersByTimeAsync(30000); // try 6
		expect(save).toHaveBeenCalledTimes(6);
		await vi.advanceTimersByTimeAsync(30000); // try 7 succeeds
		expect(auto.getState().kind).toBe("saved");
	});

	it("never runs two saves at once", async () => {
		let running = 0;
		let max = 0;
		const auto = createAutosave({
			save: async () => {
				running += 1;
				max = Math.max(max, running);
				await new Promise((r) => setTimeout(r, 100));
				running -= 1;
				return { ok: true, note: {} as never };
			},
		});
		auto.change(doc("a"));
		const a = auto.flush();
		auto.change(doc("b"));
		const b = auto.flush();
		await vi.advanceTimersByTimeAsync(500);
		await Promise.all([a, b]);
		expect(max).toBe(1);
	});

	it("subscribe returns an unsubscribe", async () => {
		const { auto } = setup();
		const seen: string[] = [];
		const off = auto.subscribe((s) => seen.push(s.kind));
		off();
		auto.change(doc("a"));
		await auto.flush();
		expect(seen).toEqual([]);
	});
});
