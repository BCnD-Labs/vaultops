import { expect, it } from "vitest";
import { placeMenu } from "./menu-placement";

const viewport = { width: 1000, height: 600 };
const menu = { width: 200, height: 300 };

it("opens below the anchor when the whole menu fits there", () => {
	const placed = placeMenu({ left: 100, top: 96, bottom: 120 }, menu, viewport);
	expect(placed).toEqual({
		side: "below",
		left: 100,
		offset: 124,
		maxHeight: 600 - 120 - 4 - 8,
	});
});

it("opens upwards when it would clip below and there is more room above", () => {
	const placed = placeMenu(
		{ left: 100, top: 520, bottom: 544 },
		menu,
		viewport,
	);
	expect(placed.side).toBe("above");
	// Grows upwards from just above the anchor: 4px gap over the anchor's top.
	expect(placed.offset).toBe(600 - 520 + 4);
	expect(placed.maxHeight).toBe(520 - 4 - 8);
	expect(placed.maxHeight).toBeGreaterThanOrEqual(menu.height);
});

it("opens upwards and scrolls when neither side fits but above is roomier", () => {
	const tall = { width: 200, height: 900 };
	const placed = placeMenu(
		{ left: 100, top: 400, bottom: 424 },
		tall,
		viewport,
	);
	expect(placed.side).toBe("above");
	expect(placed.maxHeight).toBe(400 - 4 - 8);
});

it("stays below and scrolls when neither side fits but below is roomier", () => {
	const tall = { width: 200, height: 900 };
	const placed = placeMenu(
		{ left: 100, top: 100, bottom: 124 },
		tall,
		viewport,
	);
	expect(placed.side).toBe("below");
	expect(placed.maxHeight).toBe(600 - 124 - 4 - 8);
});

it("keeps the menu inside the window sideways", () => {
	expect(
		placeMenu({ left: 950, top: 96, bottom: 120 }, menu, viewport).left,
	).toBe(1000 - 200 - 8);
	expect(
		placeMenu({ left: -30, top: 96, bottom: 120 }, menu, viewport).left,
	).toBe(8);
});

it("never reports a negative height", () => {
	const squeezed = placeMenu({ left: 0, top: 2, bottom: 598 }, menu, {
		width: 1000,
		height: 600,
	});
	expect(squeezed.maxHeight).toBeGreaterThanOrEqual(0);
});
