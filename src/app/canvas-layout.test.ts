import { expect, it, vi } from "vitest";
import {
	canvasLayout,
	canvasLocked,
	lastCanvas,
	saveCanvasLayout,
	saveCanvasLocked,
} from "./canvas-layout";

it("remembers the split and last canvas", () => {
	const values = new Map<string, string>();
	const storage = {
		getItem: (key: string) => values.get(key) ?? null,
		setItem: (key: string, value: string) => {
			values.set(key, value);
		},
	};
	saveCanvasLayout({ note: 65, canvas: 35 }, storage);
	expect(canvasLayout(storage)).toEqual({ note: 65, canvas: 35 });
	expect(canvasLocked(storage)).toBe(false);
	saveCanvasLocked(true, storage);
	expect(canvasLocked(storage)).toBe(true);
	saveCanvasLocked(false, storage);
	expect(canvasLocked(storage)).toBe(false);
	vi.stubGlobal("localStorage", storage);
	expect(lastCanvas("Vault", "Board.vnote")).toBe("Board.vnote");
	expect(lastCanvas("Vault")).toBe("Board.vnote");
	vi.unstubAllGlobals();
});

it("continues when storage access fails", () => {
	const storage = {
		getItem: () => {
			throw new Error("blocked");
		},
		setItem: () => {
			throw new Error("blocked");
		},
	};
	expect(canvasLayout(storage)).toBeUndefined();
	expect(canvasLocked(storage)).toBe(false);
	expect(() =>
		saveCanvasLayout({ note: 50, canvas: 50 }, storage),
	).not.toThrow();
	expect(() => saveCanvasLocked(true, storage)).not.toThrow();
	vi.stubGlobal("localStorage", storage);
	expect(lastCanvas("Vault", "Board.vnote")).toBeNull();
	vi.unstubAllGlobals();
});
