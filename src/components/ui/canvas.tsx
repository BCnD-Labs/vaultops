import {
	applyEdgeChanges,
	applyNodeChanges,
	Background,
	ConnectionMode,
	type Edge,
	type EdgeChange,
	Handle,
	MarkerType,
	type Node,
	type NodeChange,
	type NodeProps,
	NodeResizer,
	NodeToolbar,
	Position,
	ReactFlow,
	ReactFlowProvider,
	SelectionMode,
	useReactFlow,
	useStoreApi,
} from "@xyflow/react";
import {
	type ReactNode,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import "@xyflow/react/dist/style.css";

export interface CanvasNodeData extends Record<string, unknown> {
	label: ReactNode;
	/** Shows resize handles while the item is selected. */
	resizable?: boolean;
	/** Shows connection dots on the four sides. */
	connectable?: boolean;
	/** For a group: the ids of its members, which move with it. */
	members?: string[];
	onResizeEnd?: (
		id: string,
		box: { x: number; y: number; width: number; height: number },
	) => void;
}

export interface CanvasNode extends Node<CanvasNodeData> {}

export interface CanvasEdge {
	id: string;
	source: string;
	target: string;
	/** Draw an arrowhead at the target end. */
	arrow?: boolean;
}

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

export interface SelectionContext {
	ids: string[];
	/** The box around the selected items, in canvas coordinates. */
	bounds: () => { x: number; y: number; width: number; height: number } | null;
}

/** What the surface offers the screen around it. */
export interface CanvasApi {
	/** The middle of what is on screen, in canvas coordinates. */
	center: () => { x: number; y: number };
	zoomIn: () => void;
	zoomOut: () => void;
	/** Fit everything on the canvas into view. */
	fit: () => void;
	/** A screen point (e.g. a right-click) in canvas coordinates. */
	at: (clientX: number, clientY: number) => { x: number; y: number };
}

function ItemNode({ id, data, selected }: NodeProps<CanvasNode>) {
	return (
		<>
			{data.resizable && (
				<NodeResizer
					isVisible={selected}
					minWidth={80}
					minHeight={40}
					onResizeEnd={(_, box) => data.onResizeEnd?.(id, box)}
				/>
			)}
			{data.connectable &&
				[Position.Top, Position.Right, Position.Bottom, Position.Left].map(
					(position) => (
						<Handle
							key={position}
							id={position}
							type="source"
							position={position}
							className="canvas-handle"
						/>
					),
				)}
			{data.label}
		</>
	);
}

const nodeTypes = { item: ItemNode };

const NO_EDGES: CanvasEdge[] = [];

function Surface({
	nodes: initial,
	edges: initialEdges = NO_EDGES,
	locked = false,
	editable = false,
	onMove,
	onMoveMany,
	onConnect,
	onDeleteConnectors,
	onDropBlock,
	selectionToolbar,
	onReady,
	snap = false,
}: {
	nodes: CanvasNode[];
	edges?: CanvasEdge[];
	locked?: boolean;
	editable?: boolean;
	onMove: (id: string, position: { x: number; y: number }) => void;
	onMoveMany?: (positions: { [id: string]: { x: number; y: number } }) => void;
	onConnect?: (from: string, to: string) => void;
	onDeleteConnectors?: (ids: string[]) => void;
	onDropBlock?: (
		event: React.DragEvent,
		position: { x: number; y: number },
	) => void;
	selectionToolbar?: (context: SelectionContext) => ReactNode;
	onReady?: (api: CanvasApi) => void;
	/** Moved items land on the 20px grid. */
	snap?: boolean;
}) {
	const [nodes, setNodes] = useState(initial);
	const [selectedIds, setSelectedIds] = useState<string[]>([]);
	const [dropSpot, setDropSpot] = useState<{ x: number; y: number } | null>(
		null,
	);
	const flow = useReactFlow<CanvasNode>();
	const store = useStoreApi();
	const dragStart = useRef<Map<string, { x: number; y: number }>>(new Map());
	// Keep what is selected when the items are redrawn after a save.
	useEffect(
		() =>
			setNodes((current) =>
				initial.map((node) => ({
					...node,
					selected: current.find((c) => c.id === node.id)?.selected ?? false,
				})),
			),
		[initial],
	);
	const edges = useMemo<Edge[]>(
		() =>
			initialEdges.map((edge) => ({
				id: edge.id,
				source: edge.source,
				target: edge.target,
				className: "canvas-edge",
				...(edge.arrow ? { markerEnd: { type: MarkerType.ArrowClosed } } : {}),
			})),
		[initialEdges],
	);
	const [edgeState, setEdgeState] = useState<Edge[]>(edges);
	useEffect(
		() =>
			setEdgeState((current) =>
				edges.map((edge) => ({
					...edge,
					selected: current.find((c) => c.id === edge.id)?.selected ?? false,
				})),
			),
		[edges],
	);
	useEffect(() => {
		onReady?.({
			center: () => {
				const { width, height, transform } = store.getState();
				const [x, y, zoom] = transform;
				return { x: (width / 2 - x) / zoom, y: (height / 2 - y) / zoom };
			},
			zoomIn: () => void flow.zoomIn({ duration: 150 }),
			zoomOut: () => void flow.zoomOut({ duration: 150 }),
			fit: () => void flow.fitView({ duration: 200, padding: 0.2 }),
			at: (clientX, clientY) =>
				flow.screenToFlowPosition({ x: clientX, y: clientY }),
		});
	}, [onReady, store, flow]);
	useEffect(() => {
		const clear = () => setDropSpot(null);
		document.addEventListener("dragend", clear);
		document.addEventListener("drop", clear);
		return () => {
			document.removeEventListener("dragend", clear);
			document.removeEventListener("drop", clear);
		};
	}, []);
	const onSelectionChange = useCallback(
		({ nodes: picked }: { nodes: Node[] }) =>
			setSelectedIds((current) => {
				const next = picked.map((node) => node.id);
				return current.length === next.length &&
					current.every((id, i) => id === next[i])
					? current
					: next;
			}),
		[],
	);
	const arrange = locked || !editable;
	return (
		<ReactFlow<CanvasNode>
			nodes={nodes}
			edges={edgeState}
			nodeTypes={nodeTypes}
			onNodesChange={(changes: NodeChange<CanvasNode>[]) =>
				setNodes((current) =>
					applyNodeChanges(
						changes.filter((change) => change.type !== "remove"),
						current,
					),
				)
			}
			onEdgesChange={(changes: EdgeChange[]) =>
				setEdgeState((current) =>
					applyEdgeChanges(
						changes.filter((change) => change.type !== "remove"),
						current,
					),
				)
			}
			onSelectionChange={onSelectionChange}
			onNodeDragStart={() => {
				dragStart.current = new Map(
					flow.getNodes().map((node) => [node.id, { ...node.position }]),
				);
			}}
			onNodeDrag={(_, __, dragged) => {
				// A group carries its members along while it is dragged.
				const moving = new Set(dragged.map((node) => node.id));
				const follow = new Map<string, { x: number; y: number }>();
				for (const node of dragged) {
					const members = node.data.members;
					const from = dragStart.current.get(node.id);
					if (!members || !from) continue;
					const dx = node.position.x - from.x;
					const dy = node.position.y - from.y;
					for (const id of members) {
						const origin = dragStart.current.get(id);
						if (origin && !moving.has(id))
							follow.set(id, { x: origin.x + dx, y: origin.y + dy });
					}
				}
				if (follow.size === 0) return;
				setNodes((current) =>
					current.map((node) => {
						const position = follow.get(node.id);
						return position ? { ...node, position } : node;
					}),
				);
			}}
			onNodeDragStop={(_, __, dragged) => {
				const moved: { [id: string]: { x: number; y: number } } = {};
				for (const node of dragged) {
					moved[node.id] = { ...node.position };
					const members = node.data.members;
					const from = dragStart.current.get(node.id);
					if (!members || !from) continue;
					const dx = node.position.x - from.x;
					const dy = node.position.y - from.y;
					for (const id of members) {
						const origin = dragStart.current.get(id);
						if (origin && !dragged.some((d) => d.id === id))
							moved[id] = { x: origin.x + dx, y: origin.y + dy };
					}
				}
				const ids = Object.keys(moved);
				const only = ids[0];
				if (ids.length === 1 && only !== undefined && moved[only])
					onMove(only, moved[only]);
				else if (ids.length > 1) onMoveMany?.(moved);
			}}
			onConnect={(connection) => {
				if (connection.source && connection.target)
					onConnect?.(connection.source, connection.target);
			}}
			// Delete only ever removes selected connectors; items are deleted from the
			// toolbar after a confirmation.
			onBeforeDelete={async ({ edges: doomed }) => ({
				nodes: [],
				edges: doomed,
			})}
			onEdgesDelete={(doomed) => onDeleteConnectors?.(doomed.map((e) => e.id))}
			deleteKeyCode={arrange ? null : ["Backspace", "Delete"]}
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
			snapToGrid={snap}
			snapGrid={[20, 20]}
			{...canvasFlowProps(locked)}
			// Drag over empty space to select; pan with the middle or right button,
			// or by scrolling. Locked, the canvas does neither.
			selectionOnDrag={!locked}
			selectionMode={SelectionMode.Full}
			panOnDrag={locked ? false : [1, 2]}
			nodesConnectable={!arrange}
			connectionMode={ConnectionMode.Loose}
			// Always selectable: React Flow gives an item that can be neither dragged
			// nor selected "pointer-events: none", and a locked canvas still has to
			// let a card be grabbed and dragged out to a note.
			elementsSelectable
			proOptions={{ hideAttribution: true }}
		>
			<Background color="var(--canvas-dot)" gap={20} size={1.5} />
			{selectionToolbar && !locked && editable && selectedIds.length > 0 && (
				<NodeToolbar
					nodeId={selectedIds}
					isVisible
					position={Position.Top}
					offset={12}
				>
					{selectionToolbar({
						ids: selectedIds,
						bounds: () => {
							const picked = flow
								.getNodes()
								.filter((n) => selectedIds.includes(n.id));
							if (picked.length === 0) return null;
							const box = flow.getNodesBounds(picked);
							return box;
						},
					})}
				</NodeToolbar>
			)}
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
