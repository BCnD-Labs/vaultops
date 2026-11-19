import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { addDaysToKey } from "../../core/planner/dates";
import { type Rating, scheduleReview } from "../../core/review/scheduler";
import { FlashcardCard } from "./FlashcardCard";
import type { Review } from "./useReviewState";

export function ReviewScreen({
	review,
	writable,
}: {
	review: Review;
	writable: boolean;
}) {
	const [count, setCount] = useState(0);
	const { index, state, today, due, error } = review;
	const first = due[0],
		card = first && index?.cards.get(first.id);
	const next = Object.values(state?.items ?? {})
		.filter((r) => r?.kind === "flashcard" && index?.cards.has(r.id))
		.map((r) => r.due)
		.sort()[0];
	async function rate(rating: Rating) {
		if (!first) return;
		const saved = await review.update((s) => {
			const record = s.items[first.id] ?? first;
			const scheduled = scheduleReview(record, rating, today);
			return { ...s, items: { ...s.items, [record.id]: scheduled } };
		});
		if (saved) setCount((n) => n + 1);
	}
	return (
		<section className="overflow-auto p-4">
			<h1>Review</h1>
			<Tabs defaultValue="cards">
				<TabsList aria-label="Review modes">
					<TabsTrigger value="cards">Cards</TabsTrigger>
				</TabsList>
				<TabsContent value="cards">
					{index?.duplicates.map((path) => (
						<p key={path} className="notice">
							Duplicate flashcard in {path}. Using the first note by path.
						</p>
					))}
					{error ? (
						<p role="alert">{error}</p>
					) : !index || !state ? (
						<p>Loading cards…</p>
					) : card ? (
						<>
							<p>
								{count + 1} of {count + due.length}
							</p>
							<progress
								aria-label="Cards reviewed"
								max={count + due.length}
								value={count}
							/>
							<FlashcardCard
								key={card.blockId}
								card={card}
								writable={writable}
								rate={rate}
							/>
						</>
					) : (
						<p role="status">
							{count
								? `${count} ${count === 1 ? "card" : "cards"} reviewed`
								: "No cards due"}
							{next &&
								`, next due ${next === addDaysToKey(today, 1) ? "tomorrow" : next}`}
						</p>
					)}
				</TabsContent>
			</Tabs>
		</section>
	);
}
