import { NEW_TAB, type PaneId } from "../core/workspace";
import { setDragEffect } from "../editor/block-drag";

/** Marks a tab drag, so block drops and text drops never mistake it for theirs. */
export const TAB_DRAG_TYPE = "application/x-vaultops-tab";

/** Only the tab's path and the pane it left cross the drag; the host does the move. */
export interface TabDrag {
	path: string;
	from: PaneId;
}

export function setTabDrag(transfer: DataTransfer, drag: TabDrag): void {
	transfer.setData(TAB_DRAG_TYPE, JSON.stringify(drag));
	setDragEffect(transfer, "effectAllowed", "move");
}

export function hasTabDrag(transfer: Pick<DataTransfer, "types">): boolean {
	return Array.from(transfer.types).includes(TAB_DRAG_TYPE);
}

/** The dragged tab, or null when the drag is something else (or malformed). */
export function tabDragData(
	transfer: Pick<DataTransfer, "types" | "getData">,
): TabDrag | null {
	if (!hasTabDrag(transfer)) return null;
	try {
		const data = JSON.parse(transfer.getData(TAB_DRAG_TYPE));
		return typeof data?.path === "string" &&
			data.path !== "" &&
			data.path !== NEW_TAB &&
			(data.from === "left" || data.from === "right")
			? { path: data.path, from: data.from }
			: null;
	} catch {
		return null;
	}
}

/**
 * Where a tab dropped at `x` lands in a strip: before the first tab whose middle
 * is to the right of `x`, or at the end. `middles` are the tabs' middles, in order.
 */
export function dropIndex(middles: number[], x: number): number {
	const at = middles.findIndex((middle) => x < middle);
	return at < 0 ? middles.length : at;
}

/**
 * The index to hand the workspace for a drop at `index` of the strip's tabs (the
 * strip's own order, dragged tab and empty tab included). The workspace counts
 * without the dragged tab, and, for a tab arriving from the other pane, without
 * the empty tab.
 */
export function landingIndex(
	tabs: string[],
	drag: TabDrag,
	toPane: PaneId,
	index: number,
): number {
	if (drag.from === toPane) {
		const at = tabs.indexOf(drag.path);
		return at >= 0 && at < index ? index - 1 : index;
	}
	return index - tabs.slice(0, index).filter((tab) => tab === NEW_TAB).length;
}

/** What Alt+Shift+Left or Right does to a tab. */
export type Nudge =
	| { kind: "reorder"; index: number }
	| { kind: "pane"; to: PaneId; index?: number };

/**
 * Left or Right moves a tab one place in its strip; past the end it crosses to
 * the other pane (the left pane's last tab opens or joins the right pane; the
 * right pane's first tab joins the left pane's end). Null when there is nowhere
 * to go, for example the only tab of a single pane.
 */
export function nudgeTab(
	pane: PaneId,
	tabs: string[],
	path: string,
	direction: -1 | 1,
	split: boolean,
): Nudge | null {
	const at = tabs.indexOf(path);
	if (at < 0 || path === NEW_TAB) return null;
	const next = at + direction;
	if (next >= 0 && next < tabs.length) return { kind: "reorder", index: next };
	if (direction === 1 && pane === "left")
		return split || tabs.length > 1
			? { kind: "pane", to: "right", index: 0 }
			: null;
	if (direction === -1 && pane === "right") return { kind: "pane", to: "left" };
	return null;
}
