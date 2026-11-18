import { describe, expect, it } from "vitest";
import { dueItems, type ReviewRecord, scheduleReview } from "./scheduler";

const card: ReviewRecord = {
	id: "a",
	kind: "flashcard",
	due: "2026-01-01",
	intervalDays: 1,
	easeFactor: 2.5,
	repetition: 0,
};
describe("review scheduling", () => {
	it("applies ratings and flashcard intervals", () => {
		for (const rating of [1, 2] as const)
			expect(
				scheduleReview({ ...card, repetition: 4 }, rating, "2026-01-01")
					.intervalDays,
			).toBe(1);
		const first = scheduleReview(card, 3, "2026-01-01");
		expect(first.easeFactor).toBe(2.5);
		const second = scheduleReview(first, 4, "2026-01-02");
		expect(second.intervalDays).toBe(6);
		expect(scheduleReview(second, 3, "2026-01-08").intervalDays).toBe(16);
		expect(
			scheduleReview({ ...card, easeFactor: 1.3 }, 3, "2026-01-01").easeFactor,
		).toBeGreaterThanOrEqual(1.3);
	});
	it("advances notes gently and sorts due items", () => {
		let note = { ...card, kind: "process" as const };
		for (const interval of [3, 7, 14, 30, 30]) {
			note = scheduleReview(note, 3, "2026-01-01") as typeof note;
			expect(note.intervalDays).toBe(interval);
		}
		expect(
			dueItems({ version: 1, items: { note, card } }, "2026-01-10").map(
				(x) => x.id,
			),
		).toEqual(["a"]);
	});
});
