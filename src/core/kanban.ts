import { type ItemTone, isItemTone, newBlockId } from "./notes/canvas-ops";
export type Card = { id: string; text: string; tone?: ItemTone };
export type Column = { id: string; title: string; cards: Card[] };
export const defaultColumns = (): Column[] =>
	["To do", "Doing", "Done"].map((title) => ({
		id: newBlockId(),
		title,
		cards: [],
	}));
/** Preserve unsupported boards verbatim by displaying them read-only. */
export function readColumns(raw: unknown, fresh = false): Column[] | null {
	if (!Array.isArray(raw)) return null;
	const seen = new Set<string>();
	function id(value: unknown) {
		const key =
			!fresh && typeof value === "string" && value && !seen.has(value)
				? value
				: newBlockId();
		seen.add(key);
		return key;
	}
	const columns: Column[] = [];
	for (const col of raw) {
		if (!col || typeof col.title !== "string" || !Array.isArray(col.cards))
			return null;
		const cards: Card[] = [];
		for (const card of col.cards) {
			if (
				!card ||
				typeof card.text !== "string" ||
				(card.tone !== undefined && !isItemTone(card.tone))
			)
				return null;
			cards.push({ ...card, id: id(card.id) });
		}
		columns.push({ ...col, id: id(col.id), cards });
	}
	return columns;
}
export function addCard(cols: Column[], column: string, card: Card) {
	return cols.map((c) =>
		c.id === column ? { ...c, cards: [...c.cards, card] } : c,
	);
}
export function removeColumn(cols: Column[], id: string) {
	return cols.filter((c) => c.id !== id || c.cards.length);
}
export function reorderColumn(cols: Column[], index: number, offset: number) {
	const next = [...cols];
	const target = index + offset;
	if (target < 0 || target >= cols.length) return cols;
	next.splice(target, 0, ...next.splice(index, 1));
	return next;
}
export function moveCard(
	cols: Column[],
	id: string,
	to: string,
	before?: string,
) {
	const card = cols.flatMap((c) => c.cards).find((c) => c.id === id);
	if (!card || before === id || !cols.some((c) => c.id === to)) return cols;
	return cols.map((c) => {
		const cards = c.cards.filter((item) => item.id !== id);
		if (c.id === to) {
			const at = cards.findIndex((item) => item.id === before);
			cards.splice(at < 0 ? cards.length : at, 0, card);
		}
		return { ...c, cards };
	});
}
