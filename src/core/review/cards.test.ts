import { expect, it } from "vitest";
import { cardsOf, countDue, flashcardIds, syncCards } from "./cards";

it("separates toggle summaries, child trees, inline answers and question-only cards", () => {
	const attrs = { role: "flashcard" };
	const text = (text: string) => ({ type: "text", text });
	const cards = cardsOf({
		blocks: [
			{ id: "toggle", type: "toggle", parent: null, attrs },
			{ id: "summary", type: "paragraph", parent: "toggle" },
			{ id: "body", type: "callout", parent: "toggle", attrs },
			{ id: "inner", type: "paragraph", parent: "body" },
			{
				id: "inline",
				type: "heading",
				parent: null,
				attrs,
				content: [text("Q: why"), { type: "hardBreak" }, text("A: because")],
			},
			{ id: "alone", type: "paragraph", parent: null, attrs },
		],
	});
	expect(
		cards.map((c) => [c.question[0]?.id, c.answer.map((b) => b.id)]),
	).toEqual([
		["summary", ["body", "inner"]],
		["body", ["inner"]],
		["inline", ["inline"]],
		["alone", []],
	]);
	expect(cards[2]?.question[0]?.content).toEqual([text("why")]);
	expect(cards[2]?.answer[0]?.content).toEqual([text("because")]);
	const state = syncCards({ version: 1, items: {} }, cards, "2026-11-18");
	expect(syncCards(state, [], "2026-11-19")).toBe(state);
});

it("lists flashcard ids and counts due cards without reading their contents", () => {
	const attrs = { role: "flashcard" };
	const ids = flashcardIds({
		blocks: [
			{ id: "a", type: "paragraph", parent: null, attrs },
			{ id: "plain", type: "paragraph", parent: null },
			{ id: "b", type: "toggle", parent: null, attrs },
			{ id: "c", type: "paragraph", parent: null, attrs },
		],
	});
	expect(ids).toEqual(["a", "b", "c"]);
	const record = (id: string, due: string) => ({
		id,
		kind: "flashcard" as const,
		due,
		intervalDays: 1,
		easeFactor: 2.5,
		repetition: 1,
	});
	const state = {
		v: 1,
		items: { a: record("a", "2026-11-17"), b: record("b", "2026-11-25") },
	};
	// a is overdue, b is not due yet, c was never reviewed (due today); a repeated id counts once.
	expect(countDue(state as never, [...ids, "a"], "2026-11-18")).toBe(2);
});
