import type { Layout } from "react-resizable-panels";
import { type KeyEventLike, matchesBinding } from "../core/settings/shortcuts";

const key = "vaultops:shell-layout";
type StorageAccess = () => Pick<Storage, "getItem" | "setItem">;

export function loadLayout(
	storage: StorageAccess = () => localStorage,
): Layout | undefined {
	try {
		const layout = JSON.parse(storage().getItem(key) ?? "null");
		if (!layout || typeof layout !== "object") return;
		const sizes = [layout.left, layout.editor, layout.right];
		if (
			sizes.some(
				(n) => typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > 100,
			)
		)
			return;
		if (
			layout.editor <= 0 ||
			Math.abs(sizes.reduce((a, b) => a + b, 0) - 100) > 0.01
		)
			return;
		return { left: layout.left, editor: layout.editor, right: layout.right };
	} catch {
		return;
	}
}

export function saveLayout(
	layout: Layout,
	storage: StorageAccess = () => localStorage,
): void {
	try {
		storage().setItem(key, JSON.stringify(layout));
	} catch {
		// Layout persistence is optional, including when storage itself is unavailable.
	}
}

export function sidebarShortcut(
	event: KeyEventLike,
	left = "Mod+\\",
	right = "Mod+Shift+\\",
	mac = true,
): "left" | "right" | null {
	if (matchesBinding(event, left, mac)) return "left";
	if (matchesBinding(event, right, mac)) return "right";
	return null;
}
