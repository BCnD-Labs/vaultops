import {
	applyNodeChanges,
	Background,
	Controls,
	type Node,
	type NodeChange,
	ReactFlow,
	ReactFlowProvider,
	useReactFlow,
} from "@xyflow/react";
import { type ReactNode, useEffect, useState } from "react";
import "@xyflow/react/dist/style.css";

export interface CanvasNode extends Node<{ label: ReactNode }> {}

export function canvasFlowProps(locked = false) {
	return {
		nodesDraggable: !locked,
		panOnDrag: !locked,
		panOnScroll: !locked,
		zoomOnScroll: !locked,
		zoomOnPinch: !locked,
		zoomOnDoubleClick: !locked,
		autoPanOnNodeDrag: !locked,
	};
}

function Surface({
	nodes: initial,
	locked = false,
	onMove,
	onDropBlock,
}: {
	nodes: CanvasNode[];
	locked?: boolean;
	onMove: (id: string, position: { x: number; y: number }) => void;
	onDropBlock?: (
		event: React.DragEvent,
		position: { x: number; y: number },
	) => void;
}) {
	const [nodes, setNodes] = useState(initial);
	const [dropSpot, setDropSpot] = useState<{ x: number; y: number } | null>(
		null,
	);
	const flow = useReactFlow<CanvasNode>();
	useEffect(() => setNodes(initial), [initial]);
	useEffect(() => {
		const clear = () => setDropSpot(null);
		document.addEventListener("dragend", clear);
		document.addEventListener("drop", clear);
		return () => {
			document.removeEventListener("dragend", clear);
			document.removeEventListener("drop", clear);
		};
	}, []);
	return (
		<ReactFlow<CanvasNode>
			nodes={nodes}
			onNodesChange={(changes: NodeChange<CanvasNode>[]) =>
				setNodes((current) =>
					applyNodeChanges(
						changes.filter((change) => change.type !== "remove"),
						current,
					),
				)
			}
			onNodeDragStop={(_, node) => onMove(node.id, node.position)}
			onDragEnter={(event) => {
				if (!event.dataTransfer.types.includes("application/x-vaultops-block"))
					return;
				event.preventDefault();
				event.dataTransfer.dropEffect = "move";
			}}
			onDragOver={(event) => {
				event.preventDefault();
				const valid = event.dataTransfer.types.includes(
					"application/x-vaultops-block",
				);
				event.dataTransfer.dropEffect = valid ? "move" : "none";
				if (!valid) {
					setDropSpot(null);
					return;
				}
				const bounds = event.currentTarget.getBoundingClientRect();
				setDropSpot({
					x: event.clientX - bounds.left,
					y: event.clientY - bounds.top,
				});
			}}
			onDragLeave={(event) => {
				const next = event.relatedTarget;
				if (
					next instanceof globalThis.Node &&
					event.currentTarget.contains(next)
				)
					return;
				setDropSpot(null);
			}}
			onDrop={(event) => {
				event.preventDefault();
				setDropSpot(null);
				onDropBlock?.(
					event,
					flow.screenToFlowPosition({ x: event.clientX, y: event.clientY }),
				);
			}}
			fitView
			{...canvasFlowProps(locked)}
			proOptions={{ hideAttribution: true }}
		>
			<Background color="var(--canvas-dot)" gap={20} size={1} />
			<Controls showZoom={false} showInteractive={false} />
			{dropSpot && (
				<div
					className="canvas-drop-placeholder"
					data-testid="canvas-drop-placeholder"
					style={{ left: `${dropSpot.x}px`, top: `${dropSpot.y}px` }}
				/>
			)}
		</ReactFlow>
	);
}

export function Canvas(props: React.ComponentProps<typeof Surface>) {
	return (
		<ReactFlowProvider>
			<Surface {...props} />
		</ReactFlowProvider>
	);
}
