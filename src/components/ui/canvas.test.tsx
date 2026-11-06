// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { Canvas, type CanvasApi, type CanvasNode } from "./canvas";

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
