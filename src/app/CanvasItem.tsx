import { useEffect, useState } from "react";
import type { Block } from "../core/note-format";
import { attrsOf, ITEM_TONES, textOf } from "../core/notes/canvas-ops";

export function itemTone(block: Block): string {
	const tone = attrsOf(block).tone;
	return ITEM_TONES.find((t) => t === tone) ?? "note";
}

function attrString(block: Block, name: string, fallback: string): string {
	const value = attrsOf(block)[name];
	return typeof value === "string" && value !== "" ? value : fallback;
}

/**
 * A sticky note, shape, label or group frame on a canvas. Text is plain text
 * edited in place (double-click, or straight away for a new item); Enter with
 * Cmd or Ctrl, or leaving the field, saves it and Escape drops the change.
 */
export function CanvasItem({
	block,
	editable,
	locked = false,
	startEditing = false,
	onText,
	onTitle,
}: {
	block: Block;
	editable: boolean;
	locked?: boolean;
	startEditing?: boolean;
	onText: (text: string) => void;
	onTitle: (title: string) => void;
}) {
	const isGroup = block.type === "group";
	const saved = isGroup ? attrString(block, "title", "") : textOf(block);
	const [draft, setDraft] = useState<string | null>(
		startEditing ? saved : null,
	);
	useEffect(() => {
		if (startEditing) setDraft(saved);
	}, [startEditing, saved]);
	const finish = (keep: boolean) => {
		const next = draft;
		setDraft(null);
		if (!keep || next === null || next === saved) return;
		if (isGroup) onTitle(next);
		else onText(next);
	};
	const text =
		draft !== null ? (
			isGroup ? (
				<input
					className="canvas-item-field nodrag nowheel nopan"
					aria-label="Group title"
					// biome-ignore lint/a11y/noAutofocus: the field exists to be typed in.
					autoFocus
					value={draft}
					onChange={(event) => setDraft(event.target.value)}
					onBlur={() => finish(true)}
					onKeyDown={(event) => {
						if (event.key === "Enter") finish(true);
						else if (event.key === "Escape") finish(false);
					}}
				/>
			) : (
				<textarea
					className="canvas-item-field nodrag nowheel nopan"
					aria-label={`Text of ${block.type}`}
					// biome-ignore lint/a11y/noAutofocus: the field exists to be typed in.
					autoFocus
					value={draft}
					onChange={(event) => setDraft(event.target.value)}
					onBlur={() => finish(true)}
					onKeyDown={(event) => {
						if (event.key === "Escape") finish(false);
						else if (event.key === "Enter" && (event.metaKey || event.ctrlKey))
							finish(true);
					}}
				/>
			)
		) : (
			<span className={isGroup ? "canvas-group-title" : "canvas-item-text"}>
				{saved || (isGroup ? "Group" : "")}
			</span>
		);
	const edit = () => editable && !locked && setDraft(saved);
	const className = `canvas-item canvas-${block.type}${locked ? " canvas-item-pinned" : ""}`;
	const pinned = locked
		? "Shapes, sticky notes, labels, groups and connectors stay on the canvas."
		: undefined;
	return (
		<article
			aria-label={block.type === "sticky" ? "Sticky note" : block.type}
			className={className}
			data-tone={itemTone(block)}
			data-shape={attrString(block, "shape", "rectangle")}
			data-size={attrString(block, "size", "m")}
			title={pinned}
			onDoubleClick={edit}
		>
			{block.type === "shape" && <span className="canvas-shape-bg" />}
			{text}
		</article>
	);
}
