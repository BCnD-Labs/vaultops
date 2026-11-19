import type { Block, JsonValue, Note } from "../note-format";
import { childrenByParent } from "../notes/inbox";
import type { ReviewState } from "./scheduler";

export interface Card {
	blockId: string;
	question: Block[];
	answer: Block[];
}
const object = (v: JsonValue | undefined) =>
	v && typeof v === "object" && !Array.isArray(v) ? v : undefined;
export function cardsOf(note: Pick<Note, "blocks">): Card[] {
	const children = childrenByParent(note.blocks);
	return note.blocks.flatMap((b) => {
		if (!b.id || object(b.attrs)?.role !== "flashcard") return [];
		const roots = [...(children.get(b.id) ?? [])];
		const summary = b.type === "toggle" ? roots.shift() : undefined;
		const question: [Block] = [{ ...(summary ?? b), parent: null }];
		const answer: Block[] = [];
		const seen = new Set([b.id]);
		function collect(node: Block, parent: string | null) {
			if (!node.id || seen.has(node.id)) return;
			seen.add(node.id);
			answer.push({ ...node, parent });
			for (const child of children.get(node.id) ?? []) collect(child, node.id);
		}
		for (const root of roots) collect(root, null);
		if (
			!answer.length &&
			!summary &&
			["heading", "paragraph"].includes(b.type) &&
			Array.isArray(b.content)
		) {
			const content = b.content;
			const strip = (nodes: JsonValue[], prefix: RegExp) => {
				const first = object(nodes[0]);
				if (typeof first?.text !== "string" || !prefix.test(first.text))
					return null;
				const text = first.text.replace(prefix, "");
				return [...(text ? [{ ...first, text }] : []), ...nodes.slice(1)];
			};
			for (let i = 1; i < content.length; i++) {
				if (object(content[i])?.type !== "hardBreak") continue;
				const q = strip(content.slice(0, i), /^Q:\s*/);
				const a = strip(content.slice(i + 1), /^A:\s*/);
				if (q && a) {
					question[0].content = q;
					if (a.length) answer.push({ ...b, parent: null, content: a });
					break;
				}
			}
		}
		return [{ blockId: b.id, question, answer }];
	});
}
/** The ids of a note's flashcard blocks, cheap enough to keep on every vault row. */
export function flashcardIds(note: Pick<Note, "blocks">): string[] {
	return note.blocks.flatMap((b) =>
		b.id && object(b.attrs)?.role === "flashcard" ? [b.id] : [],
	);
}

/** How many of these cards are due: never-reviewed cards count as due today. */
export function countDue(
	state: ReviewState,
	ids: Iterable<string>,
	today: string,
): number {
	let due = 0;
	for (const id of new Set(ids)) {
		const item = state.items[id];
		if (!item || (typeof item.due === "string" && item.due <= today)) due++;
	}
	return due;
}

export function syncCards(
	state: ReviewState,
	found: Iterable<Card>,
	today: string,
): ReviewState {
	const added = Array.from(found)
		.filter((c) => !Object.hasOwn(state.items, c.blockId))
		.map(({ blockId: id }) => [
			id,
			{
				id,
				kind: "flashcard",
				due: today,
				intervalDays: 0,
				easeFactor: 2.5,
				repetition: 0,
			},
		]);
	return added.length
		? { ...state, items: { ...state.items, ...Object.fromEntries(added) } }
		: state;
}
