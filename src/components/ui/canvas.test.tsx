// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import {
	boxOf,
	Canvas,
	type CanvasApi,
	type CanvasNode,
	snapDragChanges,
} from "./canvas";

beforeAll(() => {
	class Observer {
		observe() {}
		unobserve() {}
		disconnect() {}
	}
	vi.stubGlobal("ResizeObserver", Observer);
	vi.stubGlobal(
		"DOMMatrixReadOnly",
		class {
			m22 = 1;
			constructor() {}
		},
	);
});

afterEach(cleanup);

const nodes: CanvasNode[] = [
	{
		id: "a",
		type: "item",
		position: { x: 0, y: 0 },
		data: { label: <span>Alpha</span>, connectable: true, resizable: true },
	},
	{
		id: "b",
		type: "item",
		position: { x: 200, y: 0 },
		data: { label: <span>Beta</span> },
	},
];

it("draws items and connectors with the real canvas and offers its centre", () => {
	let api: CanvasApi | null = null;
	const { getByText } = render(
		<div style={{ width: 800, height: 600 }}>
			<Canvas
				nodes={nodes}
				edges={[{ id: "k", source: "a", target: "b", arrow: true }]}
				editable
				onMove={vi.fn()}
				onReady={(ready) => {
					api = ready;
				}}
			/>
		</div>,
	);
	expect(getByText("Alpha")).toBeTruthy();
	expect(getByText("Beta")).toBeTruthy();
	const centre = (api as CanvasApi | null)?.center();
	expect(Number.isFinite(centre?.x)).toBe(true);
	expect(Number.isFinite(centre?.y)).toBe(true);
});

it("keeps a locked canvas's items grabbable so they can be dragged out to a note", () => {
	const { container } = render(
		<div style={{ width: 800, height: 600 }}>
			<Canvas nodes={nodes} locked editable onMove={vi.fn()} />
		</div>,
	);
	const wrappers = container.querySelectorAll<HTMLElement>(".react-flow__node");
	expect(wrappers.length).toBe(2);
	for (const wrapper of wrappers)
		expect(wrapper.style.pointerEvents).not.toBe("none");
});

const box = (
	id: string,
	x: number,
	y: number,
	w: number,
	h: number,
	data: Partial<CanvasNode["data"]> = {},
): CanvasNode => ({
	id,
	type: "item",
	position: { x, y },
	style: { width: w, height: h },
	data: { label: id, ...data },
});

it("reads a node's box from its measured size, then its size, then its style", () => {
	expect(
		boxOf({ ...box("a", 1, 2, 10, 20), measured: { width: 30, height: 40 } }),
	).toEqual({ x: 1, y: 2, w: 30, h: 40 });
	expect(boxOf({ ...box("a", 1, 2, 10, 20), width: 5, height: 6 })).toEqual({
		x: 1,
		y: 2,
		w: 5,
		h: 6,
	});
	expect(boxOf(box("a", 1, 2, 10, 20))).toEqual({ x: 1, y: 2, w: 10, h: 20 });
	expect(boxOf({ ...box("a", 1, 2, 0, 0), style: {} })).toEqual({
		x: 1,
		y: 2,
		w: 0,
		h: 0,
	});
});

const drag = (id: string, x: number, y: number, dragging = true) => ({
	id,
	type: "position" as const,
	position: { x, y },
	dragging,
});

it("snaps a dragged item's edge to a neighbour's, and leaves other changes alone", () => {
	const current = [box("a", 0, 0, 100, 50), box("b", 300, 300, 100, 50)];
	const select = { id: "a", type: "select" as const, selected: true };
	const out = snapDragChanges(
		[drag("a", 203, 0), select],
		[...current, box("t", 200, 400, 100, 50)],
	);
	// a's left edge (203) is 3 from t's left edge (200) → -3; top 0 has no target
	expect(out[0]).toMatchObject({ position: { x: 200, y: 0 } });
	expect(out[1]).toBe(select);
});

it("does nothing when nothing is in range, when not dragging, or with no position", () => {
	const current = [box("a", 0, 0, 100, 50), box("t", 500, 500, 100, 50)];
	const far = [drag("a", 300, 200)];
	expect(snapDragChanges(far, current)).toBe(far);
	const released = [drag("a", 503, 500, false)];
	expect(snapDragChanges(released, current)).toBe(released);
	const noPosition = [{ id: "a", type: "position" as const, dragging: true }];
	expect(snapDragChanges(noPosition, current)).toBe(noPosition);
	const unknown = [drag("zzz", 503, 500)];
	expect(snapDragChanges(unknown, current)).toBe(unknown);
});

it("snaps a multi-item drag as one box and shifts every dragged item the same", () => {
	const current = [
		box("a", 0, 0, 100, 50),
		box("b", 150, 0, 100, 50),
		box("t", 600, 0, 100, 50),
	];
	// the pair spans x 394..594 → right edge 594 is 6 short of t's left edge 600
	const out = snapDragChanges(
		[drag("a", 394, 123), drag("b", 494, 123)],
		current,
	);
	expect(out).toEqual([
		expect.objectContaining({ position: { x: 400, y: 123 } }),
		expect.objectContaining({ position: { x: 500, y: 123 } }),
	]);
});

it("does not snap to the items a dragged group carries along", () => {
	const current = [
		box("g", 0, 0, 300, 200, { members: ["m"] }),
		box("m", 100, 100, 50, 50),
	];
	const changes = [drag("g", 3, 0)];
	// m sits 2 from g's left edge and 3 from g's centre line; it moves with g, so neither counts
	const near = [
		box("g", 0, 0, 300, 200, { members: ["m"] }),
		box("m", 5, 100, 50, 50),
	];
	expect(snapDragChanges(changes, near)).toBe(changes);
	expect(snapDragChanges(changes, current)).toBe(changes);
});

it("draws items in the order given, so a later item sits on top of an earlier one", () => {
	const text = (container: HTMLElement) =>
		[...container.querySelectorAll(".react-flow__node")].map(
			(el) => el.textContent,
		);
	const view = render(
		<div style={{ width: 800, height: 600 }}>
			<Canvas nodes={nodes} editable onMove={vi.fn()} />
		</div>,
	);
	expect(text(view.container)).toEqual(["Alpha", "Beta"]);
	view.rerender(
		<div style={{ width: 800, height: 600 }}>
			<Canvas nodes={[...nodes].reverse()} editable onMove={vi.fn()} />
		</div>,
	);
	expect(text(view.container)).toEqual(["Beta", "Alpha"]);
});
