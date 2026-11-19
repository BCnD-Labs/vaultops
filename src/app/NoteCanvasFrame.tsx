import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { Block } from "../core/note-format";
import { FRAME_SIZE } from "../core/notes/canvas-arrange";
import {
	attrsOf,
	connectorEnds,
	frameDescendants,
	numberAttr,
	setText,
	textOf,
} from "../core/notes/canvas-ops";
import { blockPosition } from "../core/notes/canvas-position";
import { CanvasFrameView } from "../editor/canvas-frame";
import { NoteBlocks } from "./CanvasCard";
import { CanvasItem } from "./CanvasItem";
import type { LiveDocuments } from "./live-documents";
import type { NoteRow } from "./session";

export interface FramesApi {
	documents: LiveDocuments;
	rows: readonly NoteRow[];
}

function useCanvas(documents: LiveDocuments, canvasId: string) {
	const [snapshot, setSnapshot] = useState<{
		document: Awaited<ReturnType<LiveDocuments["subscribePassive"]>["ready"]>;
		binding: ReturnType<LiveDocuments["subscribePassive"]>;
	}>();
	useEffect(() => {
		let active = true;
		const binding = documents.subscribePassive(
			{ noteId: canvasId },
			(document) => {
				if (active) setSnapshot({ document, binding });
			},
		);
		void binding.ready.then(
			(document) => {
				if (active)
					setSnapshot({ document: binding.current() ?? document, binding });
			},
			() => {
				if (active) setSnapshot(undefined);
			},
		);
		return () => {
			active = false;
			binding.unsubscribe();
		};
	}, [documents, canvasId]);
	return snapshot?.document?.noteId === canvasId &&
		snapshot.binding.current()?.kind === "canvas"
		? snapshot
		: undefined;
}

function title(frame: Block) {
	const value = attrsOf(frame).title;
	return typeof value === "string" && value ? value : "Frame";
}

export function FramePicker({
	api,
	onPick,
	onClose,
}: {
	api: FramesApi;
	onPick: (canvasId: string, groupId: string) => void;
	onClose: () => void;
}) {
	const canvases = api.rows.filter(
		(row) =>
			row.kind === "canvas" &&
			row.id &&
			api.rows.filter((candidate) => candidate.id === row.id).length === 1,
	);
	const [canvasId, setCanvasId] = useState("");
	const canvas = useCanvas(api.documents, canvasId);
	const frames = (canvas?.document?.draft?.blocks ?? []).filter(
		(block) => block.type === "group" && block.parent === null && block.id,
	);
	return (
		<Dialog
			open
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
		>
			<DialogContent>
				<DialogTitle>Insert a frame</DialogTitle>
				<label>
					Canvas{" "}
					<select
						value={canvasId}
						onChange={(event) => setCanvasId(event.target.value)}
					>
						<option value="">Choose a canvas</option>
						{canvases.map((row) => (
							<option key={row.id} value={row.id}>
								{row.title}
							</option>
						))}
					</select>
				</label>
				{canvasId && (
					<label>
						Frame{" "}
						<select
							value=""
							onChange={(event) => onPick(canvasId, event.target.value)}
						>
							<option value="" disabled>
								{frames.length ? "Choose a frame" : "No frames available"}
							</option>
							{frames.map((frame) => (
								<option key={frame.id} value={frame.id}>
									{title(frame)}
								</option>
							))}
						</select>
					</label>
				)}
			</DialogContent>
		</Dialog>
	);
}

function plainText(block: Block) {
	return (
		block.content === undefined ||
		(Array.isArray(block.content) &&
			block.content.every(
				(part) =>
					part &&
					typeof part === "object" &&
					!Array.isArray(part) &&
					part.type === "text" &&
					typeof part.text === "string" &&
					Object.keys(part).length === 2,
			))
	);
}

export function NoteCanvasFrame({
	documents,
	canvasId,
	groupId,
	editable,
}: {
	documents: LiveDocuments;
	canvasId: string;
	groupId: string;
	editable: boolean;
}) {
	const canvas = useCanvas(documents, canvasId);
	const [error, setError] = useState(false);
	const blocks = canvas?.document?.draft?.blocks ?? [];
	const frame = blocks.find(
		(block) =>
			block.id === groupId && block.type === "group" && block.parent === null,
	);
	if (!frame) return <p className="text-muted-foreground">Frame unavailable</p>;
	const origin = blockPosition(frame);
	const width = Math.max(1, numberAttr(frame, "w", FRAME_SIZE.w));
	const height = Math.max(1, numberAttr(frame, "h", FRAME_SIZE.h));
	const scale = Math.min(1, 480 / width, 320 / height);
	const members = new Set(frameDescendants(blocks, frame));
	const canEdit =
		editable &&
		!canvas?.document?.readOnly &&
		canvas?.document?.saveStatus.kind !== "failed";
	const save = (block: Block, text: string, original: string) => {
		if (!canvas || !canEdit) return;
		void canvas.binding
			.editCanvas((all) => {
				const current = all.find(
					(item) => item.id === groupId && item.type === "group",
				);
				const target = all.find((item) => item.id === block.id);
				if (
					!current ||
					!target ||
					!block.id ||
					!frameDescendants(all, current).includes(block.id) ||
					!plainText(target) ||
					textOf(target) !== original
				)
					throw new Error("The frame changed while you were editing.");
				return setText(all, block.id, text);
			}, "editing frame text")
			.then(
				() => setError(false),
				() => setError(true),
			);
	};
	return (
		<section className="my-2 rounded border p-2" aria-label={title(frame)}>
			<div className="text-sm text-muted-foreground">{title(frame)}</div>
			{(error || canvas?.document?.saveStatus.kind === "failed") && (
				<p role="status">Frame edit could not be saved.</p>
			)}
			<div
				style={{
					width: width * scale,
					height: height * scale,
					maxWidth: "100%",
					overflow: "hidden",
				}}
			>
				<div
					style={{
						position: "relative",
						width,
						height,
						transform: `scale(${scale})`,
						transformOrigin: "top left",
					}}
				>
					{blocks.map((connector) => {
						if (connector.type !== "connector") return null;
						const { from, to } = connectorEnds(connector);
						if (!members.has(from) || !members.has(to)) return null;
						const start = blocks.find((block) => block.id === from);
						const end = blocks.find((block) => block.id === to);
						if (!start || !end) return null;
						const a = blockPosition(start);
						const b = blockPosition(end);
						return (
							<div
								key={connector.id}
								aria-hidden
								className="absolute h-px bg-muted-foreground"
								style={{
									left: a.x - origin.x + 90,
									top: a.y - origin.y + 55,
									width: Math.hypot(b.x - a.x, b.y - a.y),
									transform: `rotate(${Math.atan2(b.y - a.y, b.x - a.x)}rad)`,
									transformOrigin: "left",
								}}
							/>
						);
					})}
					{blocks
						.filter(
							(block) => block.parent === null && members.has(block.id ?? ""),
						)
						.map((block) => {
							const { x, y } = blockPosition(block);
							const canvasItem = ["sticky", "shape", "label", "group"].includes(
								block.type,
							);
							const textCard =
								["paragraph", "heading", "codeBlock", "taskBlock"].includes(
									block.type,
								) && plainText(block);
							const cardBlocks = [block];
							const ids = new Set([block.id]);
							for (const child of blocks) {
								if (child.parent !== null && ids.has(child.parent)) {
									cardBlocks.push(child);
									ids.add(child.id);
								}
							}
							return (
								<div
									key={block.id}
									style={{
										position: "absolute",
										left: x - origin.x,
										top: y - origin.y,
										width: numberAttr(block, "w", 180),
										height: numberAttr(
											block,
											"h",
											block.type === "sticky" ? 140 : 110,
										),
									}}
								>
									{canvasItem || textCard ? (
										<CanvasItem
											block={canvasItem ? block : { ...block, type: "label" }}
											editable={Boolean(
												canEdit && block.type !== "group" && plainText(block),
											)}
											onTextFrom={(text, original) =>
												save(block, text, original)
											}
											onTitle={() => {}}
										/>
									) : (
										<CanvasFrameView.Provider value={null}>
											<NoteBlocks blocks={cardBlocks} />
										</CanvasFrameView.Provider>
									)}
								</div>
							);
						})}
				</div>
			</div>
		</section>
	);
}
