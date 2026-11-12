import { ChevronRight, Ellipsis } from "lucide-react";
import {
	type CSSProperties,
	type DragEvent,
	Fragment,
	type ReactNode,
	useEffect,
} from "react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Block, JsonValue } from "../core/note-format";
import type { ItemTone } from "../core/notes/canvas-ops";
import { BLOCK_DRAG_TYPE, setDragEffect } from "../editor/block-drag";
import { quoteColorOf } from "../editor/blockquote";
import { calloutColorOf, calloutIconOf, toneOf } from "../editor/callout";
import { clipLines, isHighlighted, parseLines } from "../editor/code-highlight";
import { codeLines, lineDigits, wrapOf } from "../editor/code-language";
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
		// A link on a canvas shows the name it was saved with; opening it is for notes.
		const linkLabel =
			part.type === "noteLink" &&
			part.attrs &&
			typeof part.attrs === "object" &&
			!Array.isArray(part.attrs) &&
			typeof part.attrs.label === "string"
				? part.attrs.label
				: "";
		let content: ReactNode =
			text ||
			(part.type === "hardBreak" ? (
				<br />
			) : linkLabel ? (
				<span className="note-link-chip">{linkLabel}</span>
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

/** The plain text of a block's inline items (a code block holds only text). */
function codeText(value: JsonValue | undefined): string {
	if (!Array.isArray(value)) return "";
	return value
		.map((part) =>
			part &&
			typeof part === "object" &&
			!Array.isArray(part) &&
			typeof part.text === "string"
				? part.text
				: "",
		)
		.join("");
}

function renderBlock(block: Block, children: Map<string, Block[]>): ReactNode {
	const nested = (children.get(block.id ?? "") ?? []).map((child) => (
		<Fragment key={child.id}>{renderBlock(child, children)}</Fragment>
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
		case "blockquote": {
			const color = quoteColorOf(
				block.attrs &&
					typeof block.attrs === "object" &&
					!Array.isArray(block.attrs)
					? block.attrs.color
					: undefined,
			);
			return (
				<blockquote
					{...(color ? { "data-color": color, "data-tone": color } : {})}
				>
					{content}
					{nested}
				</blockquote>
			);
		}
		case "divider":
			return <hr />;
		case "callout": {
			const attrs =
				block.attrs &&
				typeof block.attrs === "object" &&
				!Array.isArray(block.attrs)
					? block.attrs
					: undefined;
			const color = calloutColorOf(attrs?.color);
			const icon = calloutIconOf(attrs?.icon);
			return (
				<div
					className="callout"
					data-tone={toneOf(attrs?.tone)}
					data-icon={icon ?? undefined}
					data-color={color ?? undefined}
				>
					{nested}
				</div>
			);
		}
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
		case "codeBlock": {
			const lines = codeLines(codeText(block.content));
			const lit = clipLines(
				parseLines(
					block.attrs &&
						typeof block.attrs === "object" &&
						!Array.isArray(block.attrs)
						? block.attrs.highlight
						: undefined,
				),
				lines.length,
			);
			const wrap =
				!!block.attrs &&
				typeof block.attrs === "object" &&
				!Array.isArray(block.attrs) &&
				wrapOf(block.attrs.wrap);
			return (
				<pre
					data-wrap={wrap ? "true" : undefined}
					style={{ "--code-digits": lineDigits(lines.length) } as CSSProperties}
				>
					<code>
						{lines.map((line, index) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: lines have no identity
							<Fragment key={index}>
								<span
									className="code-ln"
									aria-hidden="true"
									data-hl={isHighlighted(lit, index + 1) ? "true" : undefined}
								/>
								{isHighlighted(lit, index + 1) && line ? (
									<span className="code-hl">{line}</span>
								) : (
									line
								)}
								{index < lines.length - 1 ? "\n" : ""}
							</Fragment>
						))}
					</code>
				</pre>
			);
		}
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
}

function childrenOf(blocks: Block[]): Map<string, Block[]> {
	const children = new Map<string, Block[]>();
	for (const block of blocks) {
		if (block.parent === null) continue;
		const list = children.get(block.parent) ?? [];
		list.push(block);
		children.set(block.parent, list);
	}
	return children;
}

/** The root blocks of a note, drawn read-only, in file order. */
export function NoteBlocks({ blocks }: { blocks: Block[] }) {
	const children = childrenOf(blocks);
	return (
		<>
			{blocks
				.filter((block) => block.parent === null)
				.map((block, index) => (
					<Fragment key={block.id ?? index}>
						{renderBlock(block, children)}
					</Fragment>
				))}
		</>
	);
}

export function CanvasCard({
	root,
	blocks,
	canvasId = "",
	draggable = false,
	tone = "note",
	onMoveToNote,
	onMoveTo,
}: {
	root: Block;
	blocks: Block[];
	canvasId?: string;
	draggable?: boolean;
	/** The card's canvas color; the default shows none. */
	tone?: ItemTone;
	onMoveToNote?: () => void;
	/** Opens the picker to send this card to any note or canvas. */
	onMoveTo?: () => void;
}) {
	const children = childrenOf(blocks);
	useEffect(() => () => abandonLift(), []);
	return (
		<article
			className="canvas-card"
			data-tone={tone === "note" ? undefined : tone}
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
			{renderBlock(root, children)}
			{(onMoveToNote || onMoveTo) && (
				<DropdownMenu>
					<DropdownMenuTrigger
						className="canvas-menu nodrag"
						aria-label="Card actions"
					>
						<Ellipsis size={16} aria-hidden="true" />
					</DropdownMenuTrigger>
					<DropdownMenuContent>
						{onMoveToNote && (
							<DropdownMenuItem onSelect={onMoveToNote}>
								Move to open note
							</DropdownMenuItem>
						)}
						{onMoveTo && (
							<DropdownMenuItem onSelect={onMoveTo}>Move to…</DropdownMenuItem>
						)}
					</DropdownMenuContent>
				</DropdownMenu>
			)}
		</article>
	);
}
