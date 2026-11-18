import { expect, it } from "vitest";
import { fitWindow } from "./floating-window";

it("clamps moves, corner resizes and smaller viewports", () => {
	const rect = { left: 40, top: 40, width: 200, height: 140 };
	const viewport = { width: 400, height: 300 };
	const moved = fitWindow(rect, viewport, { x: 500, y: -80 });
	const resized = fitWindow(rect, viewport, { x: 500, y: 500, resize: true });
	const shrunk = fitWindow(rect, { width: 160, height: 100 });
	expect(moved).toEqual({ ...rect, left: 192, top: 8 });
	expect(resized).toEqual({ ...rect, width: 352, height: 252 });
	expect(shrunk).toEqual({ left: 8, top: 8, width: 144, height: 84 });
});
