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

function Surface({
	nodes: initial,
	onMove,
	onDropBlock,
}: {
	nodes: CanvasNode[];
	onMove: (id: string, position: { x: number; y: number }) => void;
	onDropBlock?: (
		event: React.DragEvent,
		position: { x: number; y: number },
	) => void;
}) {
	const [nodes, setNodes] = useState(initial);
	const flow = useReactFlow<CanvasNode>();
	useEffect(() => setNodes(initial), [initial]);
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
			onDragOver={(event) => {
				if (!event.dataTransfer.types.includes("application/x-vaultops-block"))
					return;
				event.preventDefault();
				event.dataTransfer.dropEffect = "move";
			}}
			onDrop={(event) => {
				if (!event.dataTransfer.types.includes("application/x-vaultops-block"))
					return;
				event.preventDefault();
				onDropBlock?.(
					event,
					flow.screenToFlowPosition({ x: event.clientX, y: event.clientY }),
				);
			}}
			fitView
			panOnScroll
			zoomOnPinch
			proOptions={{ hideAttribution: true }}
		>
			<Background color="var(--canvas-dot)" gap={20} size={1} />
			<Controls showZoom={false} showInteractive={false} />
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
