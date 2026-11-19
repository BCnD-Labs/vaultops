import { expect, it } from "vitest";
import {
	addCard,
	moveCard,
	readColumns,
	removeColumn,
	reorderColumn,
} from "./kanban";

it("repairs missing and duplicate ids and preserves unsupported boards for read-only display", () => {
	expect(readColumns({})).toBeNull();
	const [column] =
		readColumns([
			{
				title: "First",
				cards: [
					{ id: "x", text: "One" },
					{ id: "x", text: "Two" },
				],
			},
		]) ?? [];
	if (!column) throw new Error("Missing column");
	expect(new Set([column.id, ...column.cards.map((c) => c.id)]).size).toBe(3);
});
it("moves cards before a sibling or into an empty column", () => {
	const cols =
		readColumns([
			{ id: "a", title: "A", cards: [{ id: "1", text: "One" }] },
			{ id: "b", title: "B", cards: [] },
		]) ?? [];
	const two = addCard(cols, "a", { id: "2", text: "Two" });
	expect(moveCard(two, "2", "a", "1")[0]?.cards[0]?.id).toBe("2");
	expect(moveCard(two, "1", "b")[1]?.cards[0]?.text).toBe("One");
	expect(removeColumn(cols, "a")).toEqual(cols);
	expect(reorderColumn(cols, 1, -1)[0]?.id).toBe("b");
});
