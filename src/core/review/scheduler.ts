import { addDaysToKey } from "../planner/dates";

export type ReviewKind = "flashcard" | "process" | "resurface";
export interface ReviewRecord {
	id: string;
	kind: ReviewKind;
	due: string;
	intervalDays: number;
	easeFactor: number;
	repetition: number;
	lastReviewed?: string;
	[key: string]: unknown;
}
export interface ReviewState {
	version: 1;
	items: Record<string, ReviewRecord>;
	[key: string]: unknown;
}
export type Rating = 1 | 2 | 3 | 4;

export function scheduleReview(
	record: ReviewRecord,
	rating: Rating,
	today: string,
): ReviewRecord {
	const repetition = rating < 3 ? 0 : record.repetition + 1;
	const easeFactor =
		rating < 3
			? Math.max(1.3, record.easeFactor)
			: Math.max(
					1.3,
					record.easeFactor + 0.1 - (4 - rating) * (0.08 + (4 - rating) * 0.02),
				);
	const ladder = [1, 3, 7, 14, 30];
	const intervalDays =
		rating < 3
			? 1
			: record.kind !== "flashcard"
				? (ladder[Math.min(repetition, ladder.length - 1)] ?? 30)
				: repetition === 1
					? 1
					: repetition === 2
						? 6
						: Math.round(record.intervalDays * record.easeFactor);
	return {
		...record,
		repetition,
		easeFactor,
		intervalDays,
		due: addDaysToKey(today, intervalDays),
		lastReviewed: today,
	};
}

export function dueItems(state: ReviewState, today: string): ReviewRecord[] {
	return Object.values(state.items)
		.filter(
			(item) =>
				item != null &&
				["flashcard", "process", "resurface"].includes(item.kind) &&
				typeof item.due === "string" &&
				item.due <= today,
		)
		.sort((a, b) => a.due.localeCompare(b.due));
}
