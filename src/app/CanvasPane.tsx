import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Canvas } from "@/components/ui/canvas";
import { parseNote } from "../core/note-format";
import {
	blockPosition,
	canvasRoots,
	saveCanvasPosition,
} from "../core/notes/canvas-position";
import { BLOCK_DRAG_TYPE } from "../editor/block-drag";
import type { Host } from "../host/host";
import { CanvasCard } from "./CanvasCard";
import type { NoteRow } from "./session";

export function CanvasPane({
	host,
	path,
	canvases,
	writable,
	onSelect,
	onNew,
	onClose,
	onDropBlock,
	onMoveToNote,
}: {
	host: Host;
	path: string;
	canvases: NoteRow[];
	writable: boolean;
	onSelect: (path: string) => void;
	onNew: () => void;
	onClose: () => void;
	onDropBlock: (
		blockId: string,
		noteId: string,
		position: { x: number; y: number },
	) => Promise<void>;
	onMoveToNote?: (blockId: string) => Promise<void>;
}) {
	const [text, setText] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [surfaceRevision, setSurfaceRevision] = useState(0);
	useEffect(() => {
		let active = true;
		setText(null);
		setError(null);
		host
			.readText(path)
			.then((value) => {
				if (active) setText(value);
			})
			.catch((reason) => {
				if (active) setError(String(reason));
			});
		return () => {
			active = false;
		};
	}, [host, path]);
	const parsed = useMemo(
		() => (text === null ? null : parseNote(text)),
		[text],
	);
	const blocks =
		parsed?.note?.header.kind === "canvas" ? parsed.note.blocks : [];
	const roots = canvasRoots(blocks);
	const editable =
		writable &&
		!canvases.find((row) => row.path === path)?.readOnly &&
		parsed?.note?.header.kind === "canvas" &&
		parsed.problems.length === 0;
	const nodes = roots.map((block) => ({
		id: block.id as string,
		position: blockPosition(block),
		data: {
			label: (
				<CanvasCard
					root={block}
					blocks={blocks}
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
		draggable: editable,
	}));
	return (
		<section className="canvas-pane" aria-label="Canvas view">
			<header className="canvas-bar">
				<label className="section-label" htmlFor="canvas-switcher">
					Canvas
				</label>
				<select
					id="canvas-switcher"
					aria-label="Canvas"
					value={path}
					onChange={(event) => onSelect(event.target.value)}
				>
					{canvases.map((row) => (
						<option key={row.path} value={row.path}>
							{row.title}
						</option>
					))}
				</select>
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
			<div className="canvas-surface">
				<Canvas
					key={surfaceRevision}
					nodes={nodes}
					onMove={async (id, position) => {
						if (!editable || text === null) return;
						try {
							const saved = await saveCanvasPosition(
								host,
								path,
								text,
								id,
								position,
							);
							setText(saved);
							setError(null);
						} catch (reason) {
							setError(String(reason));
							try {
								setText(await host.readText(path));
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
								setText(await host.readText(path));
							} catch {
								/* Keep the last readable canvas. */
							}
						}
					}}
				/>
				{roots.length === 0 && (
					<p className="canvas-empty">Drag a block here from a note.</p>
				)}
			</div>
		</section>
	);
}
