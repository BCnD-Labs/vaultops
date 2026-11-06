import { ChevronRight, Ellipsis } from "lucide-react";
import { type DragEvent, Fragment, type ReactNode, useEffect } from "react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Block, JsonValue } from "../core/note-format";
import { BLOCK_DRAG_TYPE, setDragEffect } from "../editor/block-drag";
import { toneOf } from "../editor/callout";
import { abandonLift, liftBlock } from "../editor/lift";

function inline(value: JsonValue | undefined): ReactNode {
	if (!Array.isArray(value)) return null;
	return value.map((part) => {
		if (!part || typeof part !== "object" || Array.isArray(part)) return null;
		const text = typeof part.text === "string" ? part.text : "";
		const marks = Array.isArray(part.marks) ? part.marks : [];
		const date =
			part.type === "date" &&
			part.attrs &&
			typeof part.attrs === "object" &&
			!Array.isArray(part.attrs) &&
			typeof part.attrs.date === "string"
				? part.attrs.date
				: "";
		let content: ReactNode =
			text ||
			(part.type === "hardBreak" ? (
				<br />
			) : date ? (
				<time className="date-chip" dateTime={date}>
					{date}
				</time>
			) : null);
		for (const mark of marks) {
			if (!mark || typeof mark !== "object" || Array.isArray(mark)) continue;
			if (mark.type === "bold") content = <strong>{content}</strong>;
			if (mark.type === "italic") content = <em>{content}</em>;
			if (mark.type === "code") content = <code>{content}</code>;
			if (mark.type === "strike") content = <s>{content}</s>;
			if (mark.type === "underline") content = <u>{content}</u>;
			if (mark.type === "highlight") content = <mark>{content}</mark>;
			if (mark.type === "kbd") content = <kbd>{content}</kbd>;
			if (mark.type === "subscript") content = <sub>{content}</sub>;
			if (mark.type === "superscript") content = <sup>{content}</sup>;
		}
		return <span key={JSON.stringify(part)}>{content}</span>;
	});
}

export function CanvasCard({
	root,
	blocks,
	canvasId = "",
	draggable = false,
	onMoveToNote,
}: {
	root: Block;
	blocks: Block[];
	canvasId?: string;
	draggable?: boolean;
	onMoveToNote?: () => void;
}) {
	const children = new Map<string, Block[]>();
	for (const block of blocks) {
		if (block.parent === null) continue;
		const list = children.get(block.parent) ?? [];
		list.push(block);
		children.set(block.parent, list);
	}
	const render = (block: Block): ReactNode => {
		const nested = (children.get(block.id ?? "") ?? []).map((child) => (
			<Fragment key={child.id}>{render(child)}</Fragment>
		));
		const content = inline(block.content);
		switch (block.type) {
			case "heading":
				return <strong className="canvas-heading">{content}</strong>;
			case "bulletList":
				return <ul>{nested}</ul>;
			case "orderedList":
				return <ol>{nested}</ol>;
			case "taskBlock":
				return (
					<p>
						<input
							type="checkbox"
							checked={
								!!block.attrs &&
								typeof block.attrs === "object" &&
								!Array.isArray(block.attrs) &&
								block.attrs.checked === true
							}
							readOnly
							tabIndex={-1}
						/>{" "}
						{content}
					</p>
				);
			case "blockquote":
				return (
					<blockquote>
						{content}
						{nested}
					</blockquote>
				);
			case "divider":
				return <hr />;
			case "callout":
				return (
					<div
						className="callout"
						data-tone={toneOf(
							block.attrs &&
								typeof block.attrs === "object" &&
								!Array.isArray(block.attrs)
								? block.attrs.tone
								: undefined,
						)}
					>
						{nested}
					</div>
				);
			case "switch": {
				const off =
					!!block.attrs &&
					typeof block.attrs === "object" &&
					!Array.isArray(block.attrs) &&
					block.attrs.off === true;
				return (
					<div className="switch-block" data-off={off}>
						<div className="switch-content">{nested}</div>
					</div>
				);
			}
			case "toggle": {
				// Static: the card shows the saved open or closed state.
				const open =
					!!block.attrs &&
					typeof block.attrs === "object" &&
					!Array.isArray(block.attrs) &&
					block.attrs.open === true;
				return (
					<div className="toggle" data-open={open}>
						<div className="toggle-summary">
							<ChevronRight className="toggle-chevron" aria-hidden="true" />
							<div>{nested[0]}</div>
						</div>
						{open && nested.length > 1 && (
							<div className="toggle-body">{nested.slice(1)}</div>
						)}
					</div>
				);
			}
			case "codeBlock":
				return (
					<pre>
						<code>{content}</code>
					</pre>
				);
			case "table":
				return (
					<table>
						<tbody>{nested}</tbody>
					</table>
				);
			case "tableRow":
				return <tr>{nested}</tr>;
			case "tableCell":
			case "tableHeader":
				return block.type === "tableHeader" ? (
					<th>
						{content}
						{nested}
					</th>
				) : (
					<td>
						{content}
						{nested}
					</td>
				);
			case "listItem":
				return (
					<li>
						{content}
						{nested}
					</li>
				);
			default:
				return <p>{content || (nested.length ? nested : block.type)}</p>;
		}
	};
	useEffect(() => () => abandonLift(), []);
	return (
		<article
			className="canvas-card"
			draggable={draggable}
			onDragStart={(event: DragEvent<HTMLElement>) => {
				if (!draggable || !root.id) return;
				event.dataTransfer.setData(
					BLOCK_DRAG_TYPE,
					JSON.stringify({ noteId: canvasId, blockId: root.id }),
				);
				setDragEffect(event.dataTransfer, "effectAllowed", "move");
				liftBlock(event.nativeEvent, event.currentTarget, {
					kind: "card",
					omit: ".canvas-menu",
				});
			}}
		>
			{render(root)}
			{onMoveToNote && (
				<DropdownMenu>
					<DropdownMenuTrigger
						className="canvas-menu nodrag"
						aria-label="Card actions"
					>
						<Ellipsis size={16} aria-hidden="true" />
					</DropdownMenuTrigger>
					<DropdownMenuContent>
						<DropdownMenuItem onSelect={onMoveToNote}>
							Move to open note
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			)}
		</article>
	);
}
