import type { Layout } from "react-resizable-panels";

const layoutKey = "vaultops:canvas-split";
const pathKey = "vaultops:last-canvas";

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
