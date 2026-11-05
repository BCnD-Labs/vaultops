import { setBlockDragImage } from "./block-drag";

/**
 * The "held" look for dragging a block. The browser still runs the drag (so the
 * drop targets and the data stay as they were), but its own picture is hidden
 * and this draws the real block under the pointer instead: raised, a little
 * larger, swinging from the point it was grabbed. The block it left shows a
 * dashed slot. On a drop it is set down; on a cancel it returns to its slot.
 */

/** How far left of a note block the grab point may sit (the drag handle). */
const GUTTER = 40;
const MAX_WIDTH = 420;
const MAX_HEIGHT = 220;
const MAX_TILT = 3.5;
const REST_TILT = -0.8;
const FOLLOW = 0.3;
const SETTLE_MS = 160;
const RETURN_MS = 240;

export type LiftOptions = {
	/** A note block is drawn in the editor's type; a card in the card's. */
	kind: "note" | "card";
	/** A selector for parts of the block that should not be in the picture. */
	omit?: string;
};

type Lift = {
	ghost: HTMLElement;
	hole: HTMLElement;
	source: HTMLElement;
	grabX: number;
	grabY: number;
	x: number;
	y: number;
	targetX: number;
	targetY: number;
	tilt: number;
	rise: number;
	reduced: boolean;
	frame: number;
	started: number;
};

let current: Lift | null = null;
/** Clears the picture that is still animating away, if any. */
let leaving: (() => void) | null = null;

function reducedMotion(): boolean {
	return (
		typeof window.matchMedia === "function" &&
		window.matchMedia("(prefers-reduced-motion: reduce)").matches
	);
}

function clamp(value: number, low: number, high: number): number {
	return Math.min(high, Math.max(low, value));
}

function place(l: Lift, tilt: number, scale: number): string {
	return `translate3d(${l.x - l.grabX}px, ${l.y - l.grabY}px, 0) rotate(${tilt}deg) scale(${scale})`;
}

function buildGhost(
	source: HTMLElement,
	rect: DOMRect,
	options: LiftOptions,
): HTMLElement {
	const copy = source.cloneNode(true) as HTMLElement;
	copy.removeAttribute("id");
	copy.removeAttribute("contenteditable");
	copy.removeAttribute("draggable");
	if (options.omit)
		for (const part of copy.querySelectorAll(options.omit)) part.remove();
	const ghost = document.createElement("div");
	ghost.className = `lift-ghost lift-ghost--${options.kind}`;
	ghost.setAttribute("aria-hidden", "true");
	// A note block carries the editor's type with it.
	if (options.kind === "note") ghost.classList.add("note-editor");
	ghost.append(copy);
	if (rect.width > 0)
		ghost.style.width = `${Math.min(rect.width, MAX_WIDTH)}px`;
	if (rect.height > 0)
		ghost.style.maxHeight = `${Math.min(rect.height, MAX_HEIGHT)}px`;
	return ghost;
}

function frame() {
	const l = current;
	if (!l) return;
	const follow = l.reduced ? 1 : FOLLOW;
	l.x += (l.targetX - l.x) * follow;
	l.y += (l.targetY - l.y) * follow;
	// Moving fast leaves the block trailing the pointer, so it swings from the
	// grab point like something held by one corner.
	const swing = l.reduced
		? 0
		: clamp((l.targetX - l.x) * 0.12, -MAX_TILT, MAX_TILT);
	l.tilt += (swing + (l.reduced ? 0 : REST_TILT) - l.tilt) * 0.2;
	l.rise += (1 - l.rise) * 0.25;
	l.ghost.style.transform = place(l, l.tilt, 1 + 0.03 * l.rise);
	const rect = l.source.getBoundingClientRect();
	l.hole.style.display = l.source.isConnected ? "" : "none";
	l.hole.style.transform = `translate3d(${rect.left}px, ${rect.top}px, 0)`;
	l.hole.style.width = `${rect.width}px`;
	l.hole.style.height = `${rect.height}px`;
	l.frame = requestAnimationFrame(frame);
}

function track(event: Event) {
	const l = current;
	if (!l) return;
	const { clientX, clientY } = event as DragEvent;
	// Some engines report 0,0 on the last drag event.
	if (!clientX && !clientY) return;
	l.targetX = clientX;
	l.targetY = clientY;
}

function finish(event: Event) {
	endLift(
		event.type === "drop" ||
			(event as DragEvent).dataTransfer?.dropEffect !== "none",
	);
}

function cancelled() {
	// A mouse move can arrive just as the drag begins; only a later one means
	// the drag is over.
	if (current && performance.now() - current.started < 250) return;
	endLift(false);
}

function listen(on: boolean) {
	const act = on ? "addEventListener" : "removeEventListener";
	document[act]("dragover", track, true);
	document[act]("drag", track, true);
	document[act]("drop", finish, true);
	document[act]("dragend", finish, true);
	// The pointer only moves again once the drag is over.
	document[act]("pointermove", cancelled, true);
	document[act]("mousemove", cancelled, true);
}

/** Stop the lift: set the block down if it was dropped, send it back if not. */
export function endLift(dropped: boolean) {
	const l = current;
	if (!l) return;
	current = null;
	listen(false);
	cancelAnimationFrame(l.frame);
	const { ghost, hole, source } = l;
	const remove = () => {
		ghost.remove();
		hole.remove();
		if (leaving === remove) leaving = null;
	};
	if (l.reduced || typeof ghost.animate !== "function") return remove();
	let to: Keyframe;
	let duration = SETTLE_MS;
	if (dropped) {
		hole.remove();
		to = { transform: place(l, 0, 0.94), opacity: 0 };
	} else if (source.isConnected) {
		// Back into the slot it came from.
		const rect = source.getBoundingClientRect();
		to = {
			transform: `translate3d(${rect.left}px, ${rect.top}px, 0) rotate(0deg) scale(1)`,
		};
		duration = RETURN_MS;
	} else {
		to = { opacity: 0 };
	}
	leaving = remove;
	const animation = ghost.animate([{ transform: ghost.style.transform }, to], {
		duration,
		easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
		fill: "forwards",
	});
	animation.onfinish = remove;
	// Never leave a picture behind if the animation does not report back.
	setTimeout(remove, duration + 200);
}

/** Drop everything at once, with no animation (the editor went away, a new drag began). */
export function abandonLift() {
	const l = current;
	current = null;
	if (l) {
		listen(false);
		cancelAnimationFrame(l.frame);
		l.ghost.remove();
		l.hole.remove();
	}
	leaving?.();
	leaving = null;
}

/**
 * Start the lift from a dragstart. Returns false (and leaves the browser's own
 * drag picture alone) when there is no block element to draw.
 */
export function liftBlock(
	event: DragEvent,
	source: HTMLElement | null | undefined,
	options: LiftOptions,
): boolean {
	abandonLift();
	const transfer = event.dataTransfer;
	if (!transfer || !source) return false;
	setBlockDragImage(transfer, document.createElement("canvas"));
	const rect = source.getBoundingClientRect();
	const ghost = buildGhost(source, rect, options);
	const hole = document.createElement("div");
	hole.className = "lift-hole";
	hole.setAttribute("aria-hidden", "true");
	document.body.append(hole, ghost);
	const width = ghost.style.width ? Math.min(rect.width, MAX_WIDTH) : 0;
	current = {
		ghost,
		hole,
		source,
		grabX: clamp(event.clientX - rect.left, -GUTTER, width || rect.width),
		grabY: clamp(
			event.clientY - rect.top,
			0,
			Math.min(rect.height, MAX_HEIGHT),
		),
		x: event.clientX,
		y: event.clientY,
		targetX: event.clientX,
		targetY: event.clientY,
		tilt: 0,
		rise: 0,
		reduced: reducedMotion(),
		frame: 0,
		started: performance.now(),
	};
	ghost.style.transformOrigin = `${current.grabX}px ${current.grabY}px`;
	ghost.style.transform = place(current, 0, 1);
	// Raise the shadow on the next frame so it grows rather than appears.
	requestAnimationFrame(() => ghost.classList.add("lift-ghost--up"));
	listen(true);
	current.frame = requestAnimationFrame(frame);
	return true;
}
