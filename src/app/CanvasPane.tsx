import { Lock, LockOpen } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Canvas } from "@/components/ui/canvas";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { parseNote } from "../core/note-format";
import {
	blockPosition,
	canvasRoots,
	saveCanvasPosition,
} from "../core/notes/canvas-position";
import { renameNote } from "../core/notes/rename";
import { BLOCK_DRAG_TYPE } from "../editor/block-drag";
import type { Host } from "../host/host";
import { CanvasCard } from "./CanvasCard";
import { canvasLocked, saveCanvasLocked } from "./canvas-layout";
import { compareRows, type NoteRow } from "./session";

const lockLabel = "Lock canvas: drag cards out to the note";

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
	const roots = canvasRoots(blocks);
	const row = items.find((item) => item.path === activePath);
	const editable =
		writable &&
		!row?.readOnly &&
		parsed?.note?.header.kind === "canvas" &&
		parsed.problems.length === 0;
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
	const nodes = roots.map((block) => ({
		id: block.id as string,
		position: blockPosition(block),
		data: {
			label: (
				<CanvasCard
					root={block}
					blocks={blocks}
					canvasId={parsed?.note?.header.noteId ?? ""}
					draggable={!!editable}
					onMoveToNote={
						editable && onMoveToNote
							? async () => {
									try {
										await onMoveToNote(block.id as string);
										setError(null);
									} catch (reason) {
										setError(String(reason));
									}
								}
							: undefined
					}
				/>
			),
		},
		className: "canvas-node",
		draggable: Boolean(editable && !locked),
	}));
	const LockIcon = locked ? Lock : LockOpen;
	return (
		<section
			className={locked ? "canvas-pane canvas-pane-locked" : "canvas-pane"}
			aria-label="Canvas view"
			aria-busy={text === null && error === null}
		>
			<header className="canvas-bar">
				<label className="section-label" htmlFor="canvas-switcher">
					Canvas
				</label>
				<select
					id="canvas-switcher"
					aria-label="Canvas"
					value={activePath}
					onChange={(event) => onSelect(event.target.value)}
				>
					{items.map((item) => (
						<option key={item.path} value={item.path}>
							{item.title}
						</option>
					))}
				</select>
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
			{parsed &&
				(parsed.note?.header.kind !== "canvas" ||
					parsed.problems.length > 0) && (
					<p role="alert" className="notice">
						This canvas has file problems and is read-only.
					</p>
				)}
			<div
				className={
					locked ? "canvas-surface canvas-surface-locked" : "canvas-surface"
				}
			>
				<Canvas
					key={surfaceRevision}
					nodes={nodes}
					locked={locked}
					onMove={async (id, position) => {
						if (!editable || locked || baseTextRef.current === null) return;
						try {
							const saved = await saveCanvasPosition(
								host,
								activePath,
								baseTextRef.current,
								id,
								position,
							);
							baseTextRef.current = saved;
							setLoaded({ path: activePath, text: saved });
							setError(null);
						} catch (reason) {
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
							setError("This canvas is read-only, so the block was not moved.");
							return;
						}
						try {
							if (!event.dataTransfer.types.includes(BLOCK_DRAG_TYPE))
								throw new Error("Only a VaultOps block can be dropped here.");
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
							await onDropBlock(data.blockId, data.noteId, position);
							setError(null);
						} catch (reason) {
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
		</section>
	);
}
