import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createAutosave } from "./autosave";
import type { SaveOutcome } from "./note-io";

const okOutcome = { ok: true, note: {}, text: "" } as unknown as SaveOutcome;

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it("a discarded edit does not come back when its save fails afterwards", async () => {
	let release: (outcome: SaveOutcome) => void = () => {};
	const auto = createAutosave<string>({
		save: () => new Promise<SaveOutcome>((resolve) => (release = resolve)),
	});
	auto.change("old");
	await vi.advanceTimersByTimeAsync(700);
	expect(auto.getState().kind).toBe("saving");
	auto.discard();
	release({ ok: false, message: "late failure" });
	await vi.advanceTimersByTimeAsync(60000);
	expect(auto.peek()).toBeNull();
	expect(auto.getState().kind).toBe("saved");
});

it("a newer edit made after discard still saves", async () => {
	const saved: string[] = [];
	let release: (outcome: SaveOutcome) => void = () => {};
	const auto = createAutosave<string>({
		save: (doc) => {
			saved.push(doc);
			return new Promise<SaveOutcome>((resolve) => (release = resolve));
		},
	});
	auto.change("old");
	await vi.advanceTimersByTimeAsync(700);
	auto.discard();
	auto.change("new");
	release(okOutcome);
	await vi.advanceTimersByTimeAsync(1500);
	release(okOutcome);
	await vi.advanceTimersByTimeAsync(10);
	expect(saved).toEqual(["old", "new"]);
});

it("disposing during a save that then fails does not retry later", async () => {
	const saved: string[] = [];
	let release: (outcome: SaveOutcome) => void = () => {};
	const auto = createAutosave<string>({
		save: (doc) => {
			saved.push(doc);
			return new Promise<SaveOutcome>((resolve) => (release = resolve));
		},
	});
	auto.change("x");
	await vi.advanceTimersByTimeAsync(700);
	auto.dispose();
	release({ ok: false, message: "fail" });
	await vi.advanceTimersByTimeAsync(120000);
	expect(saved).toEqual(["x"]);
});
