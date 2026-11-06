import {
	Grid3x3,
	Lock,
	LockOpen,
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
import { CANVAS_ONLY_TYPES, parseNote } from "../core/note-format";
import { restoreCanvasText, saveCanvasEdit } from "../core/notes/canvas-edit";
import {
	addConnector,
	addRoot,
	attrsOf,
	canvasConnectors,
	canvasNodes,
	connectorEnds,
	createGroup,
	deleteRoots,
	groupMembers,
	newBlockId,
	numberAttr,
	patchAttrs,
	setPositions,
	setText,
} from "../core/notes/canvas-ops";
import {
	blockPosition,
	saveCanvasPosition,
} from "../core/notes/canvas-position";
import { renameNote } from "../core/notes/rename";
import { BLOCK_DRAG_TYPE } from "../editor/block-drag";
import { BLOCK_TYPES } from "../editor/blocks";
import type { Host } from "../host/host";
import { CanvasCard } from "./CanvasCard";
import { CanvasItem } from "./CanvasItem";
import { CanvasSelectionBar } from "./CanvasSelectionBar";
import {
	canvasLocked,
	canvasSnap,
	saveCanvasLocked,
	saveCanvasSnap,
} from "./canvas-layout";
import { compareRows, type NoteRow } from "./session";

const lockLabel = "Lock canvas: drag cards out to the note";
const HISTORY_LIMIT = 50;

/** Block types this build can draw and keep safe on a canvas. */
const KNOWN_TYPES: ReadonlySet<string> = new Set([
	...BLOCK_TYPES,
	...CANVAS_ONLY_TYPES,
]);

const ITEM_SIZE: { [type: string]: { w: number; h: number } } = {
	sticky: { w: 180, h: 140 },
	shape: { w: 180, h: 110 },
	group: { w: 320, h: 220 },
};

export function CanvasPane({
	host,
	path,
	canvases,
	writable,
	focusName = false,
	onFocusedName,
	onSelect,
	onRename,
	onNew,
	onClose,
	onDropBlock,
	onMoveToNote,
}: {
	host: Host;
	path: string;
	canvases: NoteRow[];
	writable: boolean;
	focusName?: boolean;
	onFocusedName?: () => void;
	onSelect: (path: string) => void;
	onRename?: (oldPath: string, newPath: string, title: string) => void;
	onNew: () => void;
	onClose: () => void;
	onDropBlock: (
		blockId: string,
		noteId: string,
		position: { x: number; y: number },
	) => Promise<void>;
	onMoveToNote?: (blockId: string) => Promise<void>;
}) {
	const [activePath, setActivePath] = useState(path);
	const [prevPathProp, setPrevPathProp] = useState(path);
	const activePathRef = useRef(path);
	if (path !== prevPathProp) {
		setPrevPathProp(path);
		activePathRef.current = path;
		setActivePath(path);
	}
	const loadedRef = useRef<{ host: Host; path: string } | null>(null);
	const baseTextRef = useRef<string | null>(null);
	const [loaded, setLoaded] = useState<{ path: string; text: string } | null>(
		null,
	);
	const [items, setItems] = useState(canvases);
	const [error, setError] = useState<string | null>(null);
	const [surfaceRevision, setSurfaceRevision] = useState(0);
	const [locked, setLocked] = useState(canvasLocked);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [snap, setSnap] = useState(canvasSnap);
	// Undo history: whole earlier file texts, kept only while this canvas is open
	// and cleared the moment the file changes behind our back.
	const undoStack = useRef<string[]>([]);
	const redoStack = useRef<string[]>([]);
	const [historySize, setHistorySize] = useState({ undo: 0, redo: 0 });
	const syncHistory = () =>
		setHistorySize({
			undo: undoStack.current.length,
			redo: redoStack.current.length,
		});
	const clearHistory = () => {
		undoStack.current = [];
		redoStack.current = [];
		syncHistory();
	};
	const remember = (before: string) => {
		undoStack.current = [...undoStack.current, before].slice(-HISTORY_LIMIT);
		redoStack.current = [];
		syncHistory();
	};
	const menuPoint = useRef<{ x: number; y: number } | null>(null);
	const rightDown = useRef<{ x: number; y: number } | null>(null);
	const canvasApi = useRef<CanvasApi | null>(null);
	const nameInput = useRef<HTMLInputElement>(null);
	const shouldFocus = useRef(focusName);
	const renamingRef = useRef(false);
	useEffect(() => {
		if (focusName) shouldFocus.current = true;
	}, [focusName]);
	useEffect(() => {
		setItems(canvases);
	}, [canvases]);
	useEffect(() => {
		if (loadedRef.current?.host === host && loadedRef.current.path === path)
			return;
		let active = true;
		activePathRef.current = path;
		baseTextRef.current = null;
		undoStack.current = [];
		redoStack.current = [];
		setHistorySize({ undo: 0, redo: 0 });
		setActivePath(path);
		setLoaded(null);
		setError(null);
		host
			.readText(path)
			.then((value) => {
				if (!active) return;
				loadedRef.current = { host, path };
				baseTextRef.current = value;
				setLoaded({ path, text: value });
			})
			.catch((reason) => {
				if (active) setError(String(reason));
			});
		return () => {
			active = false;
		};
	}, [host, path]);
	const text = loaded?.path === activePath ? loaded.text : null;
	const parsed = useMemo(
		() => (text === null ? null : parseNote(text)),
		[text],
	);
	const blocks =
		parsed?.note?.header.kind === "canvas" ? parsed.note.blocks : [];
	const roots = canvasNodes(blocks);
	const unknownType = blocks.find(
		(block) => !KNOWN_TYPES.has(block.type),
	)?.type;
	const row = items.find((item) => item.path === activePath);
	const editable =
		writable &&
		!row?.readOnly &&
		parsed?.note?.header.kind === "canvas" &&
		parsed.problems.length === 0 &&
		unknownType === undefined;
	const savedTitle =
		typeof parsed?.note?.header.title === "string"
			? parsed.note.header.title
			: (row?.title ?? activePath);
	const [name, setName] = useState(savedTitle);
	const nameRef = useRef(savedTitle);
	const [prevKey, setPrevKey] = useState(`${activePath}\n${savedTitle}`);
	if (`${activePath}\n${savedTitle}` !== prevKey) {
		setPrevKey(`${activePath}\n${savedTitle}`);
		nameRef.current = savedTitle;
		setName(savedTitle);
	}
	useEffect(() => {
		if (editable && shouldFocus.current && nameInput.current) {
			shouldFocus.current = false;
			nameInput.current.focus();
			nameInput.current.select();
			onFocusedName?.();
		}
	}, [editable, onFocusedName]);
	const commitName = async () => {
		const nextTitle = nameRef.current;
		const currentPath = activePathRef.current;
		const baseText = baseTextRef.current;
		if (
			renamingRef.current ||
			!editable ||
			!parsed?.note ||
			baseText === null ||
			nextTitle === savedTitle
		)
			return;
		renamingRef.current = true;
		try {
			if ((await host.readText(currentPath)) !== baseText)
				throw new Error(
					"The canvas changed on disk. Reload it before renaming it.",
				);
			const result = await renameNote(
				host,
				currentPath,
				parsed.note,
				nextTitle,
				{ readOnly: !editable },
			);
			if (result.notice) {
				baseTextRef.current = await host
					.readText(currentPath)
					.catch(() => baseText);
				nameRef.current = savedTitle;
				setName(savedTitle);
				setError(result.notice);
				return;
			}
			const saved = await host.readText(result.path);
			loadedRef.current = { host, path: result.path };
			activePathRef.current = result.path;
			baseTextRef.current = saved;
			setActivePath(result.path);
			setLoaded({ path: result.path, text: saved });
			setItems((current) =>
				current
					.map((item) =>
						item.path === currentPath
							? { ...item, path: result.path, title: nextTitle }
							: item,
					)
					.sort(compareRows),
			);
			setError(null);
			onRename?.(currentPath, result.path, nextTitle);
			if (result.path !== currentPath) onSelect(result.path);
		} catch (reason) {
			nameRef.current = savedTitle;
			setName(savedTitle);
			setError(reason instanceof Error ? reason.message : String(reason));
		} finally {
			renamingRef.current = false;
		}
	};
	/** Every canvas change goes through here: one atomic, checked write. */
	const commit = async (
		mutate: (all: typeof blocks) => typeof blocks,
		action: string,
	): Promise<boolean> => {
		if (!editable || baseTextRef.current === null) return false;
		try {
			const before = baseTextRef.current;
			const saved = await saveCanvasEdit(
				host,
				activePath,
				before,
				mutate,
				action,
			);
			baseTextRef.current = saved;
			if (saved !== before) remember(before);
			setLoaded({ path: activePath, text: saved });
			setError(null);
			return true;
		} catch (reason) {
			clearHistory();
			setError(reason instanceof Error ? reason.message : String(reason));
			try {
				const disk = await host.readText(activePath);
				baseTextRef.current = disk;
				setLoaded({ path: activePath, text: disk });
			} catch {
				/* Keep the last readable canvas. */
			}
			setSurfaceRevision((revision) => revision + 1);
			return false;
		}
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
	const step = async (direction: "undo" | "redo") => {
		const from = direction === "undo" ? undoStack : redoStack;
		const to = direction === "undo" ? redoStack : undoStack;
		const current = baseTextRef.current;
		const target = from.current[from.current.length - 1];
		if (!editable || locked || current === null || target === undefined) return;
		try {
			await restoreCanvasText(host, activePath, current, target);
			from.current = from.current.slice(0, -1);
			to.current = [...to.current, current];
			baseTextRef.current = target;
			setLoaded({ path: activePath, text: target });
			setError(null);
			syncHistory();
		} catch (reason) {
			clearHistory();
			setError(reason instanceof Error ? reason.message : String(reason));
			try {
				const disk = await host.readText(activePath);
				baseTextRef.current = disk;
				setLoaded({ path: activePath, text: disk });
			} catch {
				/* Keep the last readable canvas. */
			}
			setSurfaceRevision((revision) => revision + 1);
		}
	};
	const canEdit = Boolean(editable) && !locked;
	const toggleSnap = () =>
		setSnap((current) => {
			saveCanvasSnap(!current);
			return !current;
		});
	const nodes: CanvasNode[] = roots.map((block) => {
		const id = block.id as string;
		const canvasOnly = (CANVAS_ONLY_TYPES as readonly string[]).includes(
			block.type,
		);
		const size = ITEM_SIZE[block.type];
		const label = canvasOnly ? (
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
						"renaming the group",
					);
				}}
			/>
		) : (
			<CanvasCard
				key={id}
				root={block}
				blocks={blocks}
				canvasId={parsed?.note?.header.noteId ?? ""}
				draggable={!!editable}
				onMoveToNote={
					editable && onMoveToNote
						? async () => {
								try {
									await onMoveToNote(id);
									setError(null);
								} catch (reason) {
									setError(String(reason));
								}
							}
						: undefined
				}
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
				...(isGroup ? { members: groupMembers(block) } : {}),
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
			...(isGroup ? { zIndex: -1, dragHandle: ".canvas-group-title" } : {}),
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
	const LockIcon = locked ? Lock : LockOpen;
	return (
		<section
			className={locked ? "canvas-pane canvas-pane-locked" : "canvas-pane"}
			aria-label="Canvas view"
			aria-busy={text === null && error === null}
			onKeyDown={(event) => {
				if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
				const key = event.key.toLowerCase();
				if (key !== "z" && key !== "y") return;
				// Inside a text field, undo belongs to the field.
				const target = event.target as HTMLElement;
				if (target.closest("input, textarea, [contenteditable='true']")) return;
				event.preventDefault();
				void step(key === "y" || event.shiftKey ? "redo" : "undo");
			}}
		>
			<header className="canvas-bar">
				<input
					ref={nameInput}
					className="canvas-name"
					aria-label="Canvas name"
					value={name}
					disabled={!editable}
					onChange={(event) => {
						nameRef.current = event.target.value;
						setName(event.target.value);
					}}
					onBlur={() => void commitName()}
					onKeyDown={(event) => {
						if (event.key === "Enter") {
							event.preventDefault();
							void commitName();
						} else if (event.key === "Escape") {
							event.preventDefault();
							nameRef.current = savedTitle;
							setName(savedTitle);
						}
					}}
				/>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							size="sm"
							variant="ghost"
							disabled={!editable || locked}
							title={locked ? "Unlock the canvas to add items" : undefined}
						>
							<Plus aria-hidden="true" /> Add
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="start">
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
									void addItem("shape", shape === "rectangle" ? {} : { shape })
								}
							>
								Shape: {label}
							</DropdownMenuItem>
						))}
						<DropdownMenuItem onSelect={() => void addItem("label")}>
							Label
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
				<Button size="sm" variant="ghost" onClick={onNew} disabled={!writable}>
					New canvas
				</Button>
				<Button
					size="sm"
					variant="ghost"
					onClick={onClose}
					aria-label="Close canvas"
				>
					Close
				</Button>
			</header>
			{error && (
				<p role="alert" className="notice">
					{error}
				</p>
			)}
			{unknownType !== undefined && (
				<p role="alert" className="notice">
					This canvas has a block type ("{unknownType}") that this version does
					not know, so it is read-only.
				</p>
			)}
			{parsed &&
				(parsed.note?.header.kind !== "canvas" ||
					parsed.problems.length > 0) && (
					<p role="alert" className="notice">
						This canvas has file problems and is read-only.
					</p>
				)}
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
							snap={snap}
							key={surfaceRevision}
							nodes={nodes}
							edges={edges}
							locked={locked}
							editable={!!editable}
							onReady={(api) => {
								canvasApi.current = api;
							}}
							onMoveMany={(positions) => {
								if (locked) return;
								void commit(
									(all) => setPositions(all, positions),
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
							selectionToolbar={({ ids, bounds }) => (
								<CanvasSelectionBar
									ids={ids}
									blocks={blocks}
									onGroup={(members) => {
										const box = bounds();
										if (!box) return;
										const pad = 24;
										const title = 28;
										void commit(
											(all) =>
												createGroup(all, members, {
													h: Math.round(box.height + pad * 2 + title),
													w: Math.round(box.width + pad * 2),
													x: Math.round(box.x - pad),
													y: Math.round(box.y - pad - title),
												}),
											"grouping items",
										);
									}}
									onUngroup={(groupId) =>
										void commit(
											(all) => deleteRoots(all, [groupId]).blocks,
											"ungrouping",
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
							onMove={async (id, position) => {
								if (!editable || locked || baseTextRef.current === null) return;
								try {
									const before = baseTextRef.current;
									const saved = await saveCanvasPosition(
										host,
										activePath,
										before,
										id,
										position,
									);
									baseTextRef.current = saved;
									if (saved !== before) remember(before);
									setLoaded({ path: activePath, text: saved });
									setError(null);
								} catch (reason) {
									clearHistory();
									setError(String(reason));
									try {
										const disk = await host.readText(activePath);
										baseTextRef.current = disk;
										setLoaded({ path: activePath, text: disk });
									} catch {
										/* Keep the last readable canvas. */
									}
									setSurfaceRevision((revision) => revision + 1);
								}
							}}
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
									const data = JSON.parse(
										event.dataTransfer.getData(BLOCK_DRAG_TYPE),
									);
									if (
										typeof data?.blockId !== "string" ||
										!data.blockId ||
										typeof data.noteId !== "string" ||
										!data.noteId
									)
										throw new Error("This is not a valid VaultOps block drag.");
									// A card dropped back on its own canvas has nowhere to move to.
									if (data.noteId === parsed?.note?.header.noteId) return;
									await onDropBlock(data.blockId, data.noteId, position);
									setError(null);
								} catch (reason) {
									clearHistory();
									setError(String(reason));
									try {
										const disk = await host.readText(activePath);
										baseTextRef.current = disk;
										setLoaded({ path: activePath, text: disk });
									} catch {
										/* Keep the last readable canvas. */
									}
								}
							}}
						/>
						{roots.length === 0 && (
							<p className="canvas-empty">Drag a block here from a note.</p>
						)}
						<TooltipProvider>
							<div
								className="canvas-cluster"
								role="toolbar"
								aria-label="Canvas controls"
							>
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
										["Snap to grid", Grid3x3, toggleSnap, false, snap],
										[
											"Undo",
											Undo2,
											() => void step("undo"),
											!canEdit || historySize.undo === 0,
											undefined,
										],
										[
											"Redo",
											Redo2,
											() => void step("redo"),
											!canEdit || historySize.redo === 0,
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
					<ContextMenuSeparator />
					<ContextMenuItem
						disabled={!canEdit || historySize.undo === 0}
						onSelect={() => void step("undo")}
					>
						Undo
					</ContextMenuItem>
					<ContextMenuItem
						disabled={!canEdit || historySize.redo === 0}
						onSelect={() => void step("redo")}
					>
						Redo
					</ContextMenuItem>
					<ContextMenuSeparator />
					<ContextMenuCheckboxItem checked={snap} onCheckedChange={toggleSnap}>
						Snap to grid
					</ContextMenuCheckboxItem>
					<ContextMenuItem onSelect={() => canvasApi.current?.fit()}>
						Zoom to fit
					</ContextMenuItem>
				</ContextMenuContent>
			</ContextMenu>
		</section>
	);
}
