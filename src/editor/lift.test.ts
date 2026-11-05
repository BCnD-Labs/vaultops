// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { abandonLift, liftBlock } from "./lift";

type Transfer = { setDragImage: ReturnType<typeof vi.fn>; dropEffect: string };

function block(html = "<p>Hello</p>"): HTMLElement {
	const element = document.createElement("article");
	element.id = "original";
	element.setAttribute("contenteditable", "true");
	element.innerHTML = html;
	document.body.append(element);
	vi.spyOn(element, "getBoundingClientRect").mockReturnValue({
		left: 100,
		top: 200,
		width: 300,
		height: 50,
		right: 400,
		bottom: 250,
		x: 100,
		y: 200,
	} as DOMRect);
	return element;
}

function start(
	source: HTMLElement | null,
	kind: "note" | "card" = "note",
	omit?: string,
) {
	const transfer: Transfer = { setDragImage: vi.fn(), dropEffect: "none" };
	const event = {
		dataTransfer: transfer,
		clientX: 110,
		clientY: 210,
	} as unknown as DragEvent;
	return { transfer, lifted: liftBlock(event, source, { kind, omit }) };
}

function fire(type: string, x = 0, y = 0, dropEffect = "none") {
	const event = new Event(type, { bubbles: true, cancelable: true });
	Object.defineProperties(event, {
		clientX: { value: x },
		clientY: { value: y },
		dataTransfer: { value: { dropEffect } },
	});
	document.dispatchEvent(event);
}

const ghost = () => document.querySelector(".lift-ghost") as HTMLElement | null;
const hole = () => document.querySelector(".lift-hole");
/** The ghost's top-left and tilt, read from its transform. */
function pose(element: HTMLElement) {
	const match =
		/translate3d\((-?[\d.]+)px, (-?[\d.]+)px, 0\) rotate\((-?[\d.]+)deg\)/.exec(
			element.style.transform,
		);
	if (!match) throw new Error(`no pose in ${element.style.transform}`);
	return { x: Number(match[1]), y: Number(match[2]), tilt: Number(match[3]) };
}

/** Animation frames run only when the test steps them. */
let queue: FrameRequestCallback[] = [];
function frames(count: number) {
	for (let i = 0; i < count; i++) {
		const run = queue;
		queue = [];
		for (const callback of run) callback(0);
	}
}

beforeEach(() => {
	vi.restoreAllMocks();
	queue = [];
	vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
		queue.push(callback);
		return queue.length;
	});
	vi.stubGlobal("cancelAnimationFrame", () => {
		queue = [];
	});
});

afterEach(() => {
	abandonLift();
	document.body.innerHTML = "";
	vi.unstubAllGlobals();
});

it("blanks the browser's picture and draws the block itself, leaving a slot behind", () => {
	const source = block("<p>Hello</p><button class='menu'>x</button>");
	const { transfer, lifted } = start(source, "card", ".menu");
	expect(lifted).toBe(true);
	expect(transfer.setDragImage).toHaveBeenCalledOnce();
	expect(transfer.setDragImage.mock.calls[0]?.[0]).toBeInstanceOf(
		HTMLCanvasElement,
	);
	const picture = ghost() as HTMLElement;
	expect(picture.textContent).toContain("Hello");
	expect(picture.querySelector(".menu")).toBeNull();
	// The copy must not duplicate the original's id or be editable.
	expect(picture.querySelector("#original")).toBeNull();
	expect(picture.querySelector("[contenteditable]")).toBeNull();
	expect(picture.getAttribute("aria-hidden")).toBe("true");
	expect(hole()).not.toBeNull();
	expect(source.isConnected).toBe(true);
});

it("gives a note block the editor's type, and a card its own", () => {
	start(block(), "note");
	expect(ghost()?.classList.contains("note-editor")).toBe(true);
	abandonLift();
	start(block(), "card");
	expect(ghost()?.classList.contains("note-editor")).toBe(false);
	expect(ghost()?.classList.contains("lift-ghost--card")).toBe(true);
});

it("leaves the browser's own picture alone when there is no block to draw", () => {
	const { transfer, lifted } = start(null);
	expect(lifted).toBe(false);
	expect(transfer.setDragImage).not.toHaveBeenCalled();
	expect(ghost()).toBeNull();
});

it("follows the pointer and keeps the grab point under it", () => {
	start(block());
	const element = ghost() as HTMLElement;
	// Grabbed 10px right of and 10px below the block's corner.
	fire("dragover", 310, 410);
	frames(40);
	const { x, y } = pose(element);
	expect(Math.abs(x - 300)).toBeLessThan(1.5);
	expect(Math.abs(y - 400)).toBeLessThan(1.5);
});

it("lags behind a fast move and swings, then hangs level again", () => {
	start(block());
	const element = ghost() as HTMLElement;
	fire("dragover", 510, 210);
	frames(3);
	expect(pose(element).x).toBeLessThan(450);
	expect(pose(element).tilt).toBeGreaterThan(0.8);
	frames(80);
	expect(pose(element).tilt).toBeLessThan(0);
});

it("ignores 0,0 reports", () => {
	start(block());
	const element = ghost() as HTMLElement;
	fire("dragover", 310, 410);
	fire("drag", 0, 0);
	frames(40);
	expect(pose(element).x).toBeGreaterThan(290);
});

it("sets the block down on a drop and removes the slot", async () => {
	start(block());
	fire("drop", 200, 200, "move");
	expect(hole()).toBeNull();
	await vi.waitFor(() => expect(ghost()).toBeNull());
});

it("sends the block back and clears up when the drag is cancelled", async () => {
	start(block());
	fire("dragend", 200, 200, "none");
	await vi.waitFor(() => {
		expect(ghost()).toBeNull();
		expect(hole()).toBeNull();
	});
});

it("treats a dragend after a successful drop as already finished", async () => {
	start(block());
	fire("drop", 200, 200, "move");
	fire("dragend", 200, 200, "move");
	await vi.waitFor(() => expect(ghost()).toBeNull());
});

it("does not swing or animate for people who ask for reduced motion", () => {
	vi.stubGlobal("matchMedia", () => ({ matches: true }));
	start(block());
	const element = ghost() as HTMLElement;
	fire("dragover", 510, 210);
	frames(2);
	expect(pose(element).x).toBeGreaterThan(490);
	expect(pose(element).tilt).toBe(0);
	fire("drop", 510, 210, "move");
	expect(ghost()).toBeNull();
	expect(hole()).toBeNull();
});

it("replaces an earlier lift that never finished", () => {
	start(block());
	fire("dragend", 1, 1, "none");
	start(block());
	expect(document.querySelectorAll(".lift-ghost")).toHaveLength(1);
	expect(document.querySelectorAll(".lift-hole")).toHaveLength(1);
});

it("treats a later mouse move as the end of the drag, but not one at the very start", async () => {
	start(block());
	fire("mousemove", 120, 220);
	expect(ghost()).not.toBeNull();
	const later = performance.now() + 1000;
	vi.spyOn(performance, "now").mockReturnValue(later);
	fire("mousemove", 130, 230);
	await vi.waitFor(() => expect(ghost()).toBeNull());
});
