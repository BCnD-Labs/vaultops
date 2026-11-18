import {
	Grid3x3,
	Lock,
	LockOpen,
	Magnet,
	Maximize,
	Plus,
	Redo2,
	Undo2,
	ZoomIn,
	ZoomOut,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Canvas,
	type CanvasApi,
	type CanvasNode,
} from "@/components/ui/canvas";
import {
	ContextMenu,
	ContextMenuCheckboxItem,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { CANVAS_ONLY_TYPES, type NoteHeader } from "../core/note-format";
import {
	arrangeItems,
	dragFrameItems,
	FRAME_SIZE,
	frameSelection,
	framesBySize,
	type Rect,
} from "../core/notes/canvas-arrange";
import {
	EMBED_SIZE,
	embedBlock,
	embeddable,
	embedNoteId,
	indexEmbedTargets,
} from "../core/notes/canvas-embed";
import {
	addConnector,
	addRoot,
	attrsOf,
	blockTone,
	canvasConnectors,
	canvasNodes,
	connectorEnds,
	deleteRoots,
	frameDescendants,
	newBlockId,
	numberAttr,
	patchAttrs,
	setText,
	setTone,
} from "../core/notes/canvas-ops";
import { reorderItems } from "../core/notes/canvas-order";
import { blockPosition } from "../core/notes/canvas-position";
import { setShapeKind, setTextSize } from "../core/notes/canvas-style";
import { headerIcon, withIcon } from "../core/notes/icon";
import {
	BLOCK_DRAG_TYPE,
	blockDragData,
	type DocumentDrop,
} from "../editor/block-drag";
import { BLOCK_TYPES } from "../editor/blocks";
import type { LinkSource } from "../editor/note-link";
import type { Host } from "../host/host";
import { CanvasCard } from "./CanvasCard";
import { CanvasEmbed } from "./CanvasEmbed";
import { CanvasItem } from "./CanvasItem";
import { CanvasSelectionBar } from "./CanvasSelectionBar";
import {
	canvasLocked,
	canvasSnapModes,
	saveCanvasLocked,
	saveCanvasSnapModes,
} from "./canvas-layout";
import type { LiveDocument, LiveDocuments } from "./live-documents";
import { NoteIconPicker } from "./NoteIconPicker";
import { NotePickerDialog } from "./NotePickerDialog";
import type { NoteRow } from "./session";
import { commandMatches } from "./shortcuts";

const lockLabel = "Lock canvas: drag cards out to the note";
type Binding = ReturnType<LiveDocuments["subscribe"]>;
const NO_NOTES: NoteRow[] = [];

/** Block types this build can draw and keep safe on a canvas. */
const KNOWN_TYPES: ReadonlySet<string> = new Set([
	...BLOCK_TYPES,
	...CANVAS_ONLY_TYPES,
]);

const ITEM_SIZE: { [type: string]: { w: number; h: number } } = {
	sticky: { w: 180, h: 140 },
	shape: { w: 180, h: 110 },
	group: FRAME_SIZE,
	embed: { w: EMBED_SIZE.w, h: EMBED_SIZE.h },
};

export function CanvasPane({
	host,
	documents,
	path,
	canvases,
	writable,
	focusName = false,
	onFocusedName,
	onIconSaved,
	onDropBlock,
	onMoveToNote,
	onMoveTo,
	notes = NO_NOTES,
	onOpenNote,
	links,
}: {
	host: Host;
	documents: LiveDocuments | null;
	path: string;
	canvases: NoteRow[];
	writable: boolean;
	focusName?: boolean;
	onFocusedName?: () => void;
	onIconSaved?: (path: string, icon: string | undefined) => void;
	onDropBlock: DocumentDrop;
	onMoveToNote?: (blockId: string) => Promise<void>;
	/** Starts "Move to…" for a card: the app asks where, then moves it. */
	onMoveTo?: (blockId: string) => void;
	/** Every note in the vault, for embedding and for finding an embed's note. */
	notes?: NoteRow[];
	/** Opens a note, from the button on an embedded note. */
	onOpenNote?: (path: string) => void;
	links?: LinkSource;
}) {
	const [loaded, setLoaded] = useState<{
		registry: LiveDocuments;
		path: string;
		binding: Binding;
		document: LiveDocument;
	} | null>(null);
	const view =
		loaded?.registry === documents && loaded.path === path ? loaded : null;
	const document = view?.document;
	const binding = view?.binding;
	const activePath = document?.path ?? path;
	const [error, setError] = useState<string | null>(null);
	const [surfaceRevision, setSurfaceRevision] = useState(0);
	const [locked, setLocked] = useState(canvasLocked);
	const [editingId, setEditingId] = useState<string | null>(null);
	// Where the note picker was asked for: the middle of the view, or a right-click point.
	const [picking, setPicking] = useState<{
		at?: { x: number; y: number };
	} | null>(null);
	const [snapModes, setSnapModes] = useState(canvasSnapModes);
	const menuPoint = useRef<{ x: number; y: number } | null>(null);
	const rightDown = useRef<{ x: number; y: number } | null>(null);
	const canvasApi = useRef<CanvasApi | null>(null);
	const nameInput = useRef<HTMLInputElement>(null);
	const shouldFocus = useRef(focusName);
	useEffect(() => {
		if (focusName) shouldFocus.current = true;
	}, [focusName]);
	useEffect(() => {
		setError(null);
		if (!documents) return;
		let active = true;
		const update = (document: LiveDocument) => {
			if (active)
				setLoaded({
					registry: documents,
					path,
					binding: subscription,
					document,
				});
		};
		const subscription = documents.subscribePassive({ path }, update);
		void subscription.ready.then(
			(document) => {
				if (document) update(subscription.current() ?? document);
			},
			(reason) => {
				if (active)
					setError(reason instanceof Error ? reason.message : String(reason));
			},
		);
		return () => {
			active = false;
			subscription.unsubscribe();
		};
	}, [documents, path]);
	const canvasHeader = document?.draft?.header;
	const savedIcon = headerIcon(document?.base?.header);
	const icon = headerIcon(canvasHeader);
	const isCanvas = canvasHeader?.kind === "canvas";
	const hasBase = Boolean(document?.base);
	useEffect(() => {
		if (isCanvas && hasBase) onIconSaved?.(activePath, savedIcon);
	}, [activePath, savedIcon, isCanvas, hasBase, onIconSaved]);
	const blocks =
		document?.kind === "canvas" ? (document.draft?.blocks ?? []) : [];
	const roots = canvasNodes(blocks);
	const unknownType = blocks.find(
		(block) => !KNOWN_TYPES.has(block.type),
	)?.type;
	const row = canvases.find((item) => item.path === activePath);
	const failed =
		document?.saveStatus.kind === "failed" ? document.saveStatus.reason : null;
	const editable = Boolean(
		writable && !row?.readOnly && isCanvas && !document?.readOnly && !failed,
	);
	const title =
		typeof canvasHeader?.title === "string"
			? canvasHeader.title
			: (row?.title ?? activePath);
	const history = document?.canvasHistory;
	const [name, setName] = useState<{ noteId: string; text: string } | null>(
		null,
	);
	const nameEdit = name?.noteId === document?.noteId ? name : null;
	useEffect(() => {
		if (editable && shouldFocus.current && nameInput.current) {
			shouldFocus.current = false;
			nameInput.current.focus();
			nameInput.current.select();
			onFocusedName?.();
		}
	}, [editable, onFocusedName]);
	const actOnCanvas = async (work: Promise<boolean> | undefined) => {
		try {
			const saved = await work;
			setError(null);
			return Boolean(saved);
		} catch (reason) {
			setError(reason instanceof Error ? reason.message : String(reason));
			setSurfaceRevision((revision) => revision + 1);
			return false;
		}
	};
	const commit = (
		mutate: (all: typeof blocks) => typeof blocks,
		action: string,
		mutateHeader?: (header: NoteHeader) => NoteHeader,
	) =>
		actOnCanvas(
			editable ? binding?.editCanvas(mutate, action, mutateHeader) : undefined,
		);
	const commitName = async () => {
		if (!editable || !nameEdit) return;
		await commit(
			(all) => all,
			"renaming it",
			(header) => ({ ...header, title: nameEdit.text }),
		);
		setName((current) => (current === nameEdit ? null : current));
	};
	const addItem = async (
		type: "sticky" | "shape" | "label",
		extra: { [k: string]: string } = {},
		at?: { x: number; y: number },
	) => {
		const size = ITEM_SIZE[type];
		const middle = at ?? canvasApi.current?.center() ?? { x: 0, y: 0 };
		const id = newBlockId();
		const ok = await commit(
			(all) =>
				addRoot(all, {
					id,
					type,
					parent: null,
					attrs: {
						...extra,
						...(size ? { h: size.h, w: size.w } : {}),
						x: Math.round(middle.x - (size?.w ?? 80) / 2),
						y: Math.round(middle.y - (size?.h ?? 20) / 2),
					},
				}),
			"adding an item",
		);
		if (ok) setEditingId(id);
	};
	const addEmbed = async (noteId: string, at?: { x: number; y: number }) => {
		const middle = at ?? canvasApi.current?.center() ?? { x: 0, y: 0 };
		await commit(
			(all) => addRoot(all, embedBlock(newBlockId(), noteId, middle)),
			"embedding a note",
		);
	};
	const step = (direction: "undo" | "redo") =>
		actOnCanvas(
			editable && !locked ? binding?.stepCanvas(direction) : undefined,
		);
	const canEdit = Boolean(editable) && !locked;
	const framePicked = (boxes: Record<string, Rect> | undefined) => {
		if (canEdit && boxes && Object.keys(boxes).length)
			void commit((all) => frameSelection(all, boxes), "framing items");
	};
	const toggleSnap = (which: "grid" | "objects") =>
		setSnapModes((current) => {
			const next = { ...current, [which]: !current[which] };
			saveCanvasSnapModes(next);
			return next;
		});
	const embedTarget = useMemo(() => indexEmbedTargets(notes), [notes]);
	const frameLayers = framesBySize(blocks).map((frame) => frame.id);
	const nodes: CanvasNode[] = roots.map((block) => {
		const id = block.id as string;
		const canvasOnly = (CANVAS_ONLY_TYPES as readonly string[]).includes(
			block.type,
		);
		const size = ITEM_SIZE[block.type];
		const label =
			block.type === "embed" ? (
				<CanvasEmbed
					key={id}
					documents={documents}
					target={embedTarget(embedNoteId(block))}
					host={editable ? host : undefined}
					links={links}
					locked={locked}
					onOpen={onOpenNote}
					onDropBlock={onDropBlock}
				/>
			) : canvasOnly ? (
				<CanvasItem
					key={id}
					block={block}
					editable={!!editable}
					locked={locked}
					startEditing={editingId === id}
					onText={(text) => {
						setEditingId(null);
						void commit((all) => setText(all, id, text), "editing the text");
					}}
					onTitle={(title) => {
						setEditingId(null);
						void commit(
							(all) => patchAttrs(all, id, { title: title || undefined }),
							"renaming the frame",
						);
					}}
				/>
			) : (
				<CanvasCard
					key={id}
					root={block}
					blocks={blocks}
					canvasId={canvasHeader?.noteId ?? ""}
					draggable={!!editable}
					tone={blockTone(block)}
					onMoveToNote={
						editable && onMoveToNote
							? async () => {
									try {
										await onMoveToNote(id);
										setError(null);
									} catch (reason) {
										setError(
											reason instanceof Error ? reason.message : String(reason),
										);
									}
								}
							: undefined
					}
					onMoveTo={editable && onMoveTo ? () => onMoveTo(id) : undefined}
				/>
			);
		const isGroup = block.type === "group";
		const width = canvasOnly ? numberAttr(block, "w", size?.w ?? 0) : 0;
		const height = canvasOnly ? numberAttr(block, "h", size?.h ?? 0) : 0;
		return {
			id,
			type: "item",
			position: blockPosition(block),
			data: {
				label,
				resizable: Boolean(editable && !locked && size),
				connectable: Boolean(editable && !locked && !isGroup),
				...(isGroup ? { members: frameDescendants(blocks, block) } : {}),
				onResizeEnd: (
					itemId: string,
					box: { x: number; y: number; width: number; height: number },
				) =>
					void commit(
						(all) =>
							patchAttrs(all, itemId, {
								h: Math.round(box.height),
								w: Math.round(box.width),
								x: Math.round(box.x),
								y: Math.round(box.y),
							}),
						"resizing an item",
					),
			},
			className: canvasOnly
				? `canvas-item-node canvas-node-${block.type}`
				: "canvas-node",
			draggable: Boolean(editable && !locked),
			...(width > 0 && height > 0 ? { style: { height, width } } : {}),
			...(isGroup
				? {
						zIndex: -1 - frameLayers.indexOf(id),
						dragHandle: ".canvas-group-title",
					}
				: {}),
		};
	});
	const present = new Set(roots.map((block) => block.id));
	const edges = canvasConnectors(blocks).flatMap((block) => {
		const ends = connectorEnds(block);
		const arrow = attrsOf(block).arrow;
		return present.has(ends.from) && present.has(ends.to)
			? [
					{
						id: block.id as string,
						source: ends.from,
						target: ends.to,
						arrow: arrow !== "none",
					},
				]
			: [];
	});
	const pickable = embeddable(notes);
	const LockIcon = locked ? Lock : LockOpen;
	return (
		<section
			className={locked ? "canvas-pane canvas-pane-locked" : "canvas-pane"}
			aria-label="Canvas view"
			data-undo-canvas={canEdit ? document?.noteId : undefined}
			aria-busy={!document && error === null}
			onKeyDown={(event) => {
				const target = event.target as HTMLElement;
				if (target.closest("input, textarea, select, [contenteditable='true']"))
					return;
				if (commandMatches(event.nativeEvent, "frame-selection")) {
					event.preventDefault();
					framePicked(canvasApi.current?.selectedBoxes());
					return;
				}
				if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
				const key = event.key.toLowerCase();
				if (key !== "z" && key !== "y") return;
				event.preventDefault();
				void step(key === "y" || event.shiftKey ? "redo" : "undo");
			}}
		>
			{(failed || error || document?.canvasRenameNotice) && (
				<p role="alert" className="notice">
					{failed || error || document?.canvasRenameNotice}
				</p>
			)}
			{unknownType !== undefined && (
				<p role="alert" className="notice">
					This canvas has a block type ("{unknownType}") that this version does
					not know, so it is read-only.
				</p>
			)}
			{document && (!isCanvas || (!document.base && !unknownType)) && (
				<p role="alert" className="notice">
					This canvas has file problems and is read-only.
				</p>
			)}
			<header className="canvas-bar">
				<NoteIconPicker
					key={path}
					icon={icon}
					onChange={
						editable
							? (next) =>
									void commit(
										(all) => all,
										"changing its icon",
										(header) => withIcon(header, next),
									)
							: undefined
					}
				/>
				<input
					ref={nameInput}
					className="canvas-name"
					aria-label="Canvas name"
					value={nameEdit?.text ?? title}
					disabled={!editable}
					onChange={(event) => {
						if (document?.noteId)
							setName({ noteId: document.noteId, text: event.target.value });
					}}
					onBlur={() => void commitName()}
					onKeyDown={(event) => {
						if (event.key === "Enter") {
							event.preventDefault();
							void commitName();
						} else if (event.key === "Escape") {
							event.preventDefault();
							setName(null);
						}
					}}
				/>
			</header>
			<ContextMenu>
				<ContextMenuTrigger
					asChild
					onContextMenu={(event) => {
						// A right-button drag pans the canvas; only a plain click opens the menu.
						const down = rightDown.current;
						if (
							down &&
							Math.hypot(event.clientX - down.x, event.clientY - down.y) > 4
						) {
							event.preventDefault();
							return;
						}
						menuPoint.current = { x: event.clientX, y: event.clientY };
					}}
				>
					<div
						className={
							locked ? "canvas-surface canvas-surface-locked" : "canvas-surface"
						}
						onMouseDownCapture={(event) => {
							rightDown.current =
								event.button === 2
									? { x: event.clientX, y: event.clientY }
									: null;
						}}
					>
						<Canvas
							snap={snapModes.grid}
							snapObjects={snapModes.objects}
							key={surfaceRevision}
							nodes={nodes}
							edges={edges}
							locked={locked}
							editable={!!editable}
							onReady={(api) => {
								canvasApi.current = api;
							}}
							onDragItems={(boxes) => {
								if (!canEdit) return;
								void commit(
									(all) => dragFrameItems(all, boxes),
									"moving items",
								);
							}}
							onConnect={(from, to) =>
								void commit(
									(all) => addConnector(all, from, to),
									"connecting items",
								)
							}
							onDeleteConnectors={(ids) =>
								void commit(
									(all) => deleteRoots(all, ids).blocks,
									"deleting a connector",
								)
							}
							selectionToolbar={({ ids, boxes, allBoxes }) => (
								<CanvasSelectionBar
									ids={ids}
									blocks={blocks}
									onTone={(toned, tone) =>
										void commit(
											(all) => setTone(all, toned, tone),
											"changing the color",
										)
									}
									onOrder={(picked, how) => {
										const rects = allBoxes();
										void commit(
											(all) => reorderItems(all, picked, how, rects),
											how === "front" || how === "forward"
												? "bringing items forward"
												: "sending items back",
										);
									}}
									onShape={(shapes, kind) =>
										void commit(
											(all) => setShapeKind(all, shapes, kind),
											"changing the shape",
										)
									}
									onTextSize={(texts, size) =>
										void commit(
											(all) => setTextSize(all, texts, size),
											"changing the text size",
										)
									}
									onArrange={(how) => {
										const picked = boxes();
										void commit(
											(all) => arrangeItems(all, picked, how),
											how.startsWith("distribute")
												? "distributing items"
												: "aligning items",
										);
									}}
									onGroup={() => framePicked(boxes())}
									onSlide={(id, slide) =>
										void commit(
											(all) => patchAttrs(all, id, { slide }),
											"changing the slide number",
										)
									}
									onUngroup={(groupId) =>
										void commit(
											(all) => deleteRoots(all, [groupId]).blocks,
											"removing a frame",
										)
									}
									onDelete={(doomed) =>
										void commit(
											(all) => deleteRoots(all, doomed).blocks,
											"deleting items",
										)
									}
								/>
							)}
							onDropBlock={async (event, position) => {
								if (!editable) {
									setError(
										"This canvas is read-only, so the block was not moved.",
									);
									return;
								}
								try {
									if (!event.dataTransfer.types.includes(BLOCK_DRAG_TYPE))
										throw new Error(
											"Only a VaultOps block can be dropped here.",
										);
									const data = blockDragData(event.dataTransfer);
									if (!data || !document?.noteId)
										throw new Error(
											"Only a whole VaultOps block can be dropped here.",
										);
									await onDropBlock(
										document.noteId,
										data.blockId,
										data.noteId,
										position,
										event.altKey || undefined,
									);
									setError(null);
								} catch (reason) {
									setError(
										reason instanceof Error ? reason.message : String(reason),
									);
								}
							}}
						/>
						{document && roots.length === 0 && (
							<p className="canvas-empty">Drag a block here from a note.</p>
						)}
						<TooltipProvider>
							<div
								className="canvas-cluster"
								role="toolbar"
								aria-label="Canvas controls"
							>
								<DropdownMenu>
									<Tooltip>
										<TooltipTrigger asChild>
											<DropdownMenuTrigger asChild>
												<Button
													size="icon"
													variant="ghost"
													aria-label="Add to canvas"
													disabled={!editable || locked}
												>
													<Plus size={16} aria-hidden="true" />
												</Button>
											</DropdownMenuTrigger>
										</TooltipTrigger>
										<TooltipContent side="left">
											{locked ? "Unlock the canvas to add items" : "Add"}
										</TooltipContent>
									</Tooltip>
									{/* Keep focus off the button afterwards: the new item opens its own text field. */}
									<DropdownMenuContent
										side="left"
										align="start"
										onCloseAutoFocus={(event) => event.preventDefault()}
									>
										<DropdownMenuItem onSelect={() => void addItem("sticky")}>
											Sticky note
										</DropdownMenuItem>
										{(
											[
												["rectangle", "Rectangle"],
												["rounded", "Rounded box"],
												["ellipse", "Ellipse"],
												["diamond", "Diamond"],
											] as const
										).map(([shape, label]) => (
											<DropdownMenuItem
												key={shape}
												onSelect={() =>
													void addItem(
														"shape",
														shape === "rectangle" ? {} : { shape },
													)
												}
											>
												Shape: {label}
											</DropdownMenuItem>
										))}
										<DropdownMenuItem onSelect={() => void addItem("label")}>
											Label
										</DropdownMenuItem>
										<DropdownMenuItem
											disabled={pickable.length === 0}
											onSelect={() => setPicking({})}
										>
											Embed a note...
										</DropdownMenuItem>
									</DropdownMenuContent>
								</DropdownMenu>
								{(
									[
										[
											"Zoom in",
											ZoomIn,
											() => canvasApi.current?.zoomIn(),
											false,
											undefined,
										],
										[
											"Zoom out",
											ZoomOut,
											() => canvasApi.current?.zoomOut(),
											false,
											undefined,
										],
										[
											"Zoom to fit",
											Maximize,
											() => canvasApi.current?.fit(),
											false,
											undefined,
										],
										[
											"Snap to grid",
											Grid3x3,
											() => toggleSnap("grid"),
											false,
											snapModes.grid,
										],
										[
											"Snap to objects",
											Magnet,
											() => toggleSnap("objects"),
											false,
											snapModes.objects,
										],
										[
											"Undo",
											Undo2,
											() => void step("undo"),
											!canEdit || !history?.undo.length,
											undefined,
										],
										[
											"Redo",
											Redo2,
											() => void step("redo"),
											!canEdit || !history?.redo.length,
											undefined,
										],
									] as const
								).map(([label, Icon, run, disabled, pressed]) => (
									<Tooltip key={label}>
										<TooltipTrigger asChild>
											<Button
												size="icon"
												variant="ghost"
												aria-label={label}
												aria-pressed={pressed}
												disabled={disabled}
												onClick={run}
											>
												<Icon size={16} aria-hidden="true" />
											</Button>
										</TooltipTrigger>
										<TooltipContent side="left">{label}</TooltipContent>
									</Tooltip>
								))}
							</div>
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										size="icon"
										variant="ghost"
										className="canvas-lock"
										aria-label={lockLabel}
										aria-pressed={locked}
										title={lockLabel}
										onClick={() =>
											setLocked((current) => {
												const next = !current;
												saveCanvasLocked(next);
												return next;
											})
										}
									>
										<LockIcon size={16} aria-hidden="true" />
									</Button>
								</TooltipTrigger>
								<TooltipContent side="left">{lockLabel}</TooltipContent>
							</Tooltip>
						</TooltipProvider>
					</div>
				</ContextMenuTrigger>
				<ContextMenuContent>
					{(
						[
							["Add sticky note here", "sticky", {}],
							["Add rectangle here", "shape", {}],
							["Add ellipse here", "shape", { shape: "ellipse" }],
							["Add label here", "label", {}],
						] as const
					).map(([label, type, extra]) => (
						<ContextMenuItem
							key={label}
							disabled={!canEdit}
							onSelect={() => {
								const point = menuPoint.current;
								void addItem(
									type,
									{ ...extra },
									point ? canvasApi.current?.at(point.x, point.y) : undefined,
								);
							}}
						>
							{label}
						</ContextMenuItem>
					))}
					<ContextMenuItem
						disabled={!canEdit || pickable.length === 0}
						onSelect={() => {
							const point = menuPoint.current;
							setPicking({
								at: point ? canvasApi.current?.at(point.x, point.y) : undefined,
							});
						}}
					>
						Embed a note here...
					</ContextMenuItem>
					<ContextMenuSeparator />
					<ContextMenuItem
						disabled={!canEdit || !history?.undo.length}
						onSelect={() => void step("undo")}
					>
						Undo
					</ContextMenuItem>
					<ContextMenuItem
						disabled={!canEdit || !history?.redo.length}
						onSelect={() => void step("redo")}
					>
						Redo
					</ContextMenuItem>
					<ContextMenuSeparator />
					<ContextMenuCheckboxItem
						checked={snapModes.grid}
						onCheckedChange={() => toggleSnap("grid")}
					>
						Snap to grid
					</ContextMenuCheckboxItem>
					<ContextMenuCheckboxItem
						checked={snapModes.objects}
						onCheckedChange={() => toggleSnap("objects")}
					>
						Snap to objects
					</ContextMenuCheckboxItem>
					<ContextMenuItem onSelect={() => canvasApi.current?.fit()}>
						Zoom to fit
					</ContextMenuItem>
				</ContextMenuContent>
			</ContextMenu>
			<NotePickerDialog
				open={picking !== null}
				onOpenChange={(next) => {
					if (!next) setPicking(null);
				}}
				title="Embed a note"
				notes={pickable}
				onPick={(picked) => {
					const at = picking?.at;
					setPicking(null);
					if (picked.id) void addEmbed(picked.id, at);
				}}
			/>
		</section>
	);
}
