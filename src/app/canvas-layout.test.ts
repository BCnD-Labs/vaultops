import { expect, it, vi } from "vitest";
import {
	canvasLayout,
	canvasLocked,
	canvasSnap,
	canvasSnapModes,
	lastCanvas,
	saveCanvasLayout,
	saveCanvasLocked,
	saveCanvasSnap,
	saveCanvasSnapModes,
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

function memoryStorage(initial?: string) {
	const values = new Map<string, string>();
	if (initial !== undefined) values.set("vaultops:canvas-snap", initial);
	return {
		values,
		getItem: (key: string) => values.get(key) ?? null,
		setItem: (key: string, value: string) => {
			values.set(key, value);
		},
	};
}

it("reads the original true/false snap values as grid on and off", () => {
	expect(canvasSnapModes(memoryStorage("true"))).toEqual({
		grid: true,
		objects: false,
	});
	expect(canvasSnapModes(memoryStorage("false"))).toEqual({
		grid: false,
		objects: false,
	});
	expect(canvasSnapModes(memoryStorage())).toEqual({
		grid: false,
		objects: false,
	});
	expect(canvasSnapModes(memoryStorage("nonsense"))).toEqual({
		grid: false,
		objects: false,
	});
});

it("stores grid and object snapping together under the one key", () => {
	for (const modes of [
		{ grid: false, objects: false },
		{ grid: true, objects: false },
		{ grid: false, objects: true },
		{ grid: true, objects: true },
	]) {
		const storage = memoryStorage();
		saveCanvasSnapModes(modes, storage);
		expect([...storage.values.keys()]).toEqual(["vaultops:canvas-snap"]);
		expect(canvasSnapModes(storage)).toEqual(modes);
	}
	const legacy = memoryStorage();
	saveCanvasSnapModes({ grid: true, objects: false }, legacy);
	expect(legacy.values.get("vaultops:canvas-snap")).toBe("true");
});

it("changing the grid leaves the object choice alone", () => {
	const storage = memoryStorage("objects");
	saveCanvasSnap(true, storage);
	expect(canvasSnapModes(storage)).toEqual({ grid: true, objects: true });
	saveCanvasSnap(false, storage);
	expect(canvasSnapModes(storage)).toEqual({ grid: false, objects: true });
	expect(canvasSnap(storage)).toBe(false);
});
