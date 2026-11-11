import type { Layout } from "react-resizable-panels";

const layoutKey = "vaultops:canvas-split";
const pathKey = "vaultops:last-canvas";
const lockKey = "vaultops:canvas-locked";

export function canvasLayout(
	storage?: Pick<Storage, "getItem">,
): Layout | undefined {
	try {
		const size = Number((storage ?? localStorage).getItem(layoutKey));
		return Number.isFinite(size) && size >= 25 && size <= 75
			? { note: 100 - size, canvas: size }
			: undefined;
	} catch {
		return undefined;
	}
}

export function saveCanvasLayout(
	layout: Layout,
	storage?: Pick<Storage, "setItem">,
) {
	if (typeof layout.canvas !== "number") return;
	try {
		(storage ?? localStorage).setItem(layoutKey, String(layout.canvas));
	} catch {
		/* Optional preference. */
	}
}

export function lastCanvas(vault: string, path?: string | null): string | null {
	try {
		const paths = JSON.parse(localStorage.getItem(pathKey) ?? "{}") as Record<
			string,
			string
		>;
		if (path !== undefined) {
			if (path) paths[vault] = path;
			localStorage.setItem(pathKey, JSON.stringify(paths));
		}
		return paths[vault] ?? null;
	} catch {
		return null;
	}
}

export function canvasLocked(storage?: Pick<Storage, "getItem">): boolean {
	try {
		return (storage ?? localStorage).getItem(lockKey) === "true";
	} catch {
		return false;
	}
}

export function saveCanvasLocked(
	locked: boolean,
	storage?: Pick<Storage, "setItem">,
) {
	try {
		(storage ?? localStorage).setItem(lockKey, String(locked));
	} catch {
		/* Optional preference. */
	}
}

const snapKey = "vaultops:canvas-snap";

/** What a dragged item catches on: the dot grid, other items' edges, both or neither. */
export interface SnapModes {
	grid: boolean;
	objects: boolean;
}

/**
 * Stored under one key: "true" and "false" are the original grid on/off
 * values, so a choice made before objects could be snapped to still reads
 * the same; "objects" and "both" are the newer ones.
 */
export function canvasSnapModes(storage?: Pick<Storage, "getItem">): SnapModes {
	try {
		const value = (storage ?? localStorage).getItem(snapKey);
		return {
			grid: value === "true" || value === "both",
			objects: value === "objects" || value === "both",
		};
	} catch {
		return { grid: false, objects: false };
	}
}

export function saveCanvasSnapModes(
	modes: SnapModes,
	storage?: Pick<Storage, "setItem">,
) {
	try {
		(storage ?? localStorage).setItem(
			snapKey,
			modes.grid && modes.objects
				? "both"
				: modes.objects
					? "objects"
					: String(modes.grid),
		);
	} catch {
		/* Optional preference. */
	}
}

export function canvasSnap(storage?: Pick<Storage, "getItem">): boolean {
	return canvasSnapModes(storage).grid;
}

export function saveCanvasSnap(
	snap: boolean,
	storage?: Pick<Storage, "setItem" | "getItem">,
) {
	saveCanvasSnapModes(
		{ ...canvasSnapModes(storage ?? localStorage), grid: snap },
		storage,
	);
}
