import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { Card } from "../../core/review/cards";
import type { Rating } from "../../core/review/scheduler";

import { NoteBlocks } from "../CanvasCard";
import "./review.css";

export function FlashcardCard({
	card,
	rate,
	writable,
}: {
	card: Card & { noteId?: string };
	rate: (rating: Rating) => Promise<void>;
	writable: boolean;
}) {
	const [flipped, flip] = useState(false);
	const locked = useRef(false);
	const control = useRef<HTMLButtonElement>(null);
	useEffect(() => {
		control.current?.focus();
	}, []);
	async function choose(value: Rating) {
		if (!flipped || !writable || locked.current) return;
		locked.current = true;
		try {
			await rate(value);
		} finally {
			locked.current = false;
		}
	}
	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: Rating shortcuts apply while a control in this card has focus.
		<section
			className="mx-auto max-w-xl space-y-4 p-4"
			onKeyDown={(e) => {
				if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
				if (/^[1-4]$/.test(e.key)) {
					e.preventDefault();
					void choose(Number(e.key) as Rating);
				}
			}}
		>
			<div key={String(flipped)} className="review-face rounded-md border p-4">
				<NoteBlocks blocks={flipped ? card.answer : card.question} />
				{flipped && !card.answer.length && <p>No answer written</p>}
			</div>
			<Button ref={control} onClick={() => flip(!flipped)}>
				{flipped ? "Show question" : "Show answer"}
			</Button>
			{flipped && (
				<div className="flex gap-2">
					{([1, 2, 3, 4] as const).map((v, i) => (
						<Button
							variant="outline"
							disabled={!writable}
							key={v}
							onClick={() => void choose(v)}
						>
							{v} · {["Again", "Hard", "Good", "Easy"][i]}
						</Button>
					))}
				</div>
			)}
			{card.noteId && (
				<Button
					variant="ghost"
					data-preview-note={card.noteId}
					data-edit-card=""
				>
					Edit card
				</Button>
			)}
		</section>
	);
}
