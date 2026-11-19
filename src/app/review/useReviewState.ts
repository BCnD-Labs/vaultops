import { useEffect, useMemo, useState } from "react";
import type { Block } from "../../core/note-format";
import { keyOfDate } from "../../core/planner/dates";
import {
	type Card,
	cardsOf,
	countDue,
	syncCards,
} from "../../core/review/cards";
import { dueItems, type ReviewState } from "../../core/review/scheduler";
import { loadReview, saveReview } from "../../core/review/storage";

import type { Host } from "../../host/host";
import { liveNoteSnapshot } from "../CanvasEmbed";
import type { LiveDocuments } from "../live-documents";
import type { NoteRow } from "../session";

export function useReviewState(
	host: Host,
	documents: LiveDocuments | null | undefined,
	notes: NoteRow[] | undefined,
	writable: boolean,
	/** The Review screen is showing: only then are card notes opened and new cards recorded. */
	showing: boolean,
) {
	const [state, setState] = useState<ReviewState>();
	const [error, setError] = useState("");
	const [index, setIndex] = useState<{
		cards: Map<string, Card & { noteId?: string }>;
		duplicates: string[];
	}>();
	const store = useMemo(() => {
		let current: ReviewState | undefined;
		let active = true;
		const publish = (value: ReviewState) => {
			current = value;
			if (active) setState(value);
		};
		const fail = (e: unknown) => {
			if (active) setError(String(e));
			return false;
		};
		return {
			load() {
				active = true;
				setState(undefined);
				setError("");
				if (documents)
					void documents.run(() => loadReview(host)).then(publish, fail);
			},
			close() {
				active = false;
			},
			async update(change: (s: ReviewState) => ReviewState) {
				if (!documents) return false;
				return documents
					.run(async () => {
						if (!active || !current) return false;
						const next = change(current);
						if (next !== current) {
							await saveReview(host, next);
							publish(next);
						}
						return true;
					})
					.catch(fail);
			},
		};
	}, [host, documents]);
	useEffect(() => {
		store.load();
		return store.close;
	}, [store]);
	useEffect(() => {
		setIndex(undefined);
		// The sidebar count comes from the vault rows; notes are opened only while
		// Review is on screen, and only the ones that hold cards.
		if (!documents || !notes || !showing) return;
		let active = true,
			ready = false;
		const cache = new WeakMap<Block[], Card[]>();
		const rows = notes
			.filter((n) => n.kind !== "canvas" && (n.flashcards?.length ?? 0) > 0)
			.sort((a, b) => (a.path < b.path ? -1 : 1));
		function refresh() {
			if (!ready || !active) return;
			const cards = new Map<string, Card & { noteId?: string }>(),
				duplicates = new Set<string>();
			for (const { row, binding } of subs) {
				const current = binding.current();
				const snapshot = liveNoteSnapshot(current);
				if (!snapshot || current?.path !== row.path) continue;
				const found = cache.get(snapshot.blocks) ?? cardsOf(snapshot);
				cache.set(snapshot.blocks, found);
				for (const card of found) {
					if (cards.has(card.blockId)) duplicates.add(row.path);
					else cards.set(card.blockId, { ...card, noteId: row.id });
				}
			}
			setIndex({ cards, duplicates: [...duplicates] });
		}
		const subs = rows.map((row) => ({
			row,
			binding: documents.subscribePassive({ path: row.path }, refresh),
		}));
		void Promise.all(subs.map((s) => s.binding.ready)).then(
			() => {
				ready = true;
				refresh();
			},
			(e) => {
				if (active) setError(String(e));
			},
		);
		return () => {
			active = false;
			for (const s of subs) s.binding.unsubscribe();
		};
	}, [documents, notes, showing]);
	const { update } = store;
	const today = keyOfDate(new Date());
	useEffect(() => {
		if (showing && index && state && writable)
			void update((previous) =>
				syncCards(previous, index.cards.values(), today),
			);
	}, [showing, index, state, today, writable, update]);
	const due =
		state && index
			? dueItems(syncCards(state, index.cards.values(), today), today).filter(
					(r) => r.kind === "flashcard" && index.cards.has(r.id),
				)
			: [];
	const dueCount =
		showing && index
			? due.length
			: state && notes
				? countDue(
						state,
						notes.flatMap((n) =>
							n.kind === "canvas" ? [] : (n.flashcards ?? []),
						),
						today,
					)
				: 0;
	return { index, state, error, due, dueCount, update, today };
}
export type Review = ReturnType<typeof useReviewState>;
