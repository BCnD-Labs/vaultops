/** Where something a menu hangs from is on screen (the caret, for the slash menu). */
export interface Anchor {
	left: number;
	top: number;
	bottom: number;
}

export interface Size {
	width: number;
	height: number;
}

export interface MenuPlacement {
	side: "below" | "above";
	left: number;
	/**
	 * Distance from the viewport's top edge when `below`, or from its bottom
	 * edge when `above` (so an upward menu grows upwards from the anchor).
	 */
	offset: number;
	/** The most height the menu may take on its side; it scrolls past that. */
	maxHeight: number;
}

/**
 * Place a menu next to its anchor without letting it run off the window. It
 * opens below, the normal way, unless that would clip and there is more room
 * above, in which case it opens upwards. If neither side has room for all of
 * it, it takes the roomier side and scrolls. It also stays inside the window
 * horizontally.
 */
export function placeMenu(
	anchor: Anchor,
	menu: Size,
	viewport: Size,
	gap = 4,
	margin = 8,
): MenuPlacement {
	const below = viewport.height - anchor.bottom - gap - margin;
	const above = anchor.top - gap - margin;
	const side = menu.height <= below || below >= above ? "below" : "above";
	const room = Math.max(side === "below" ? below : above, 0);
	const left = Math.max(
		margin,
		Math.min(anchor.left, viewport.width - menu.width - margin),
	);
	return side === "below"
		? { side, left, offset: anchor.bottom + gap, maxHeight: room }
		: {
				side,
				left,
				offset: viewport.height - anchor.top + gap,
				maxHeight: room,
			};
}
