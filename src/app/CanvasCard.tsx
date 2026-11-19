import { ChevronRight, Ellipsis } from "lucide-react";
import {
	type CSSProperties,
	type DragEvent,
	Fragment,
	type ReactNode,
	useContext,
	useEffect,
	useRef,
	useState,
} from "react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Block, JsonValue } from "../core/note-format";
import type { ItemTone } from "../core/notes/canvas-ops";
import {
	DEFAULT_XMAX,
	DEFAULT_XMIN,
	normalizeRange,
} from "../core/plot/layout";
import {
	BLOCK_DRAG_TYPE,
	blockDragData,
	findBlockDropTarget,
	setDragEffect,
} from "../editor/block-drag";
import { quoteColorOf } from "../editor/blockquote";
import { calloutColorOf, calloutIconOf, toneOf } from "../editor/callout";
import { CanvasFrameView } from "../editor/canvas-frame";
import { clipLines, isHighlighted, parseLines } from "../editor/code-highlight";
import { codeLines, lineDigits, wrapOf } from "../editor/code-language";
import { abandonLift, liftBlock } from "../editor/lift";
import { MathField } from "../editor/MathField";
import { latexOf } from "../editor/math-block";
import type { NoteEditorProps } from "../editor/NoteEditor";
import { computePlot, exprOf, PlotGraph } from "../editor/plot-block";
import { SendToBlock } from "./SendToDialog";

function inline(value: JsonValue | undefined, noteLinks?: boolean): ReactNode {
	if (!Array.isArray(value)) return null;
	return value.map((part) => {
		if (!part || typeof part !== "object" || Array.isArray(part)) return null;
		const text = typeof part.text === "string" ? part.text : "";
		const marks = Array.isArray(part.marks) ? part.marks : [];
		const raw = part.attrs;
		const attrs =
			raw && typeof raw === "object" && !Array.isArray(raw) ? raw : null;
		const date =
			part.type === "date" && typeof attrs?.date === "string" ? attrs.date : "";
		const linkLabel =
			part.type === "noteLink" && typeof attrs?.label === "string"
				? attrs.label
				: "";
		const previewId =
			noteLinks && attrs?.kind === "note" && typeof attrs.target === "string"
				? attrs.target
				: undefined;
		const Chip = previewId ? "button" : "span";
		let content: ReactNode =
			text ||
			(part.type === "hardBreak" ? (
				<br />
			) : linkLabel ? (
				<Chip
					className="note-link-chip"
					type={previewId ? "button" : undefined}
					data-preview-note={previewId}
				>
					{linkLabel}
				</Chip>
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
			if (mark.type === "highlight") {
				const attrs = mark.attrs;
				const color =
					attrs && typeof attrs === "object" && !Array.isArray(attrs)
						? attrs.color
						: undefined;
				content = (
					<mark data-color={typeof color === "string" ? color : undefined}>
						{content}
					</mark>
				);
			}
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

type FrameRenderer = React.ContextType<typeof CanvasFrameView>;

function renderBlock(
	block: Block,
	children: Map<string, Block[]>,
	noteLinks?: boolean,
	frameView?: FrameRenderer,
): ReactNode {
	const nested = (children.get(block.id ?? "") ?? []).map((child) => (
		<Fragment key={child.id}>
			{renderBlock(child, children, noteLinks, frameView)}
		</Fragment>
	));
	const content = inline(block.content, noteLinks);
	switch (block.type) {
		case "canvasFrame": {
			const attrs = block.attrs;
			if (
				attrs &&
				typeof attrs === "object" &&
				!Array.isArray(attrs) &&
				typeof attrs.canvasId === "string" &&
				typeof attrs.groupId === "string"
			)
				return (
					frameView?.(attrs.canvasId, attrs.groupId) ?? "Frame unavailable"
				);
			return "Frame unavailable";
		}
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
		case "buttonBlock": {
			const attrs = block.attrs;
			const label =
				attrs && typeof attrs === "object" && !Array.isArray(attrs)
					? attrs.label
					: null;
			return (
				<Button type="button" disabled>
					{typeof label === "string" && label ? label : "Button"}
				</Button>
			);
		}
		case "mathBlock":
			return (
				<div className="math-block">
					<MathField
						value={latexOf(
							block.attrs &&
								typeof block.attrs === "object" &&
								!Array.isArray(block.attrs)
								? block.attrs.latex
								: undefined,
						)}
						readOnly
						onChange={() => {}}
						onLeave={() => {}}
						onEmptyDelete={() => {}}
					/>
				</div>
			);
		case "plotBlock": {
			const attrs =
				block.attrs &&
				typeof block.attrs === "object" &&
				!Array.isArray(block.attrs)
					? block.attrs
					: {};
			const [xmin, xmax] = normalizeRange(
				attrs.xmin ?? DEFAULT_XMIN,
				attrs.xmax ?? DEFAULT_XMAX,
			);
			const { shown } = computePlot(
				exprOf(attrs.expr ?? undefined),
				xmin,
				xmax,
			);
			return (
				<div className="plot-block">
					{shown ? (
						<PlotGraph shown={shown} />
					) : (
						<p className="plot-empty">No graph</p>
					)}
				</div>
			);
		}
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
			const visibleLines = lines.slice(0, 100);
			const remainingLines = lines.length - visibleLines.length;
			const lit = clipLines(
				parseLines(
					block.attrs &&
						typeof block.attrs === "object" &&
						!Array.isArray(block.attrs)
						? block.attrs.highlight
						: undefined,
				),
				visibleLines.length,
			);
			const wrap =
				!!block.attrs &&
				typeof block.attrs === "object" &&
				!Array.isArray(block.attrs) &&
				wrapOf(block.attrs.wrap);
			return (
				<pre
					data-wrap={wrap ? "true" : undefined}
					style={
						{
							"--code-digits": lineDigits(visibleLines.length),
						} as CSSProperties
					}
				>
					<code>
						{visibleLines.map((line, index) => (
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
								{index < visibleLines.length - 1 ? "\n" : ""}
							</Fragment>
						))}
					</code>
					{remainingLines > 0 && (
						<span
							className="code-more-lines"
							style={{ display: "block", paddingLeft: "var(--code-gutter)" }}
						>
							{remainingLines} more {remainingLines === 1 ? "line" : "lines"}
						</span>
					)}
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
export function NoteBlocks({
	blocks,
	noteLinks,
}: {
	blocks: Block[];
	noteLinks?: boolean;
}) {
	const children = childrenOf(blocks);
	const frameView = useContext(CanvasFrameView);
	return (
		<>
			{blocks
				.filter((block) => block.parent === null)
				.map((block, index) => (
					<Fragment key={block.id ?? index}>
						{renderBlock(block, children, noteLinks, frameView)}
					</Fragment>
				))}
		</>
	);
}

export function useNoteDrop<T extends HTMLElement = HTMLDivElement>(
	blocks: Block[],
	drop?: NoteEditorProps["onDropBlock"],
) {
	const ref = useRef<T>(null);
	const [top, setTop] = useState<number | null>(null);
	const slot = (y: number) => {
		const body = ref.current;
		if (!body) return null;
		const editor = body.querySelector(".ProseMirror");
		const ids = blocks
			.filter((block) => block.parent === null)
			.map((block) => block.id);
		return findBlockDropTarget(editor ?? body, ids, y, body);
	};
	const clear = () => setTop(null);
	return {
		ref,
		indicator:
			top === null ? null : (
				<div
					className="block-drop-indicator"
					data-testid="block-drop-indicator"
					style={{ top }}
				/>
			),
		events: {
			onDragOver(event: DragEvent<HTMLElement>) {
				if (
					event.defaultPrevented ||
					!drop ||
					!event.dataTransfer.types.includes(BLOCK_DRAG_TYPE)
				)
					return clear();
				event.preventDefault();
				setDragEffect(
					event.dataTransfer,
					"dropEffect",
					event.altKey ? "copy" : "move",
				);
				const body = ref.current;
				const scale =
					body && body.getBoundingClientRect().height / body.offsetHeight;
				const at = slot(event.clientY);
				setTop(at && body ? at.top / (scale || 1) + body.scrollTop : null);
			},
			onDragLeave(event: DragEvent<HTMLElement>) {
				if (
					!(
						event.relatedTarget instanceof Node &&
						event.currentTarget.contains(event.relatedTarget)
					)
				)
					clear();
			},
			onDragEnd: clear,
			onDrop(event: DragEvent<HTMLElement>) {
				clear();
				if (event.defaultPrevented || !drop) return;
				const data = blockDragData(event.dataTransfer);
				const at = data && slot(event.clientY);
				if (!data || !at) return;
				event.preventDefault();
				const { after, near, start } = at;
				void drop(
					data.blockId,
					data.noteId,
					{ after, near, start },
					event.altKey,
				);
			},
		},
	};
}

export function DroppableNoteBlocks({
	blocks,
	noteLinks,
	onDropBlock,
}: Parameters<typeof NoteBlocks>[0] & {
	onDropBlock?: NoteEditorProps["onDropBlock"];
}) {
	const { ref, indicator, events } = useNoteDrop<HTMLElement>(
		blocks,
		onDropBlock,
	);
	return (
		<section
			ref={ref}
			className="relative min-h-full"
			aria-label="Note blocks"
			{...events}
		>
			<NoteBlocks blocks={blocks} noteLinks={noteLinks} />
			{indicator}
		</section>
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
	const sendTo = useContext(SendToBlock);
	const canSend = draggable && canvasId && sendTo;
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
				setDragEffect(event.dataTransfer, "effectAllowed", "copyMove");
				liftBlock(event.nativeEvent, event.currentTarget, {
					kind: "card",
					omit: ".canvas-menu",
				});
			}}
		>
			{renderBlock(root, children)}
			{(onMoveToNote || onMoveTo || canSend) && (
				<DropdownMenu>
					<DropdownMenuTrigger
						className="canvas-menu nodrag"
						aria-label="Card actions"
					>
						<Ellipsis size={16} aria-hidden="true" />
					</DropdownMenuTrigger>
					<DropdownMenuContent>
						{canSend && (
							<DropdownMenuItem onSelect={() => sendTo?.(canvasId, root)}>
								Send to…
							</DropdownMenuItem>
						)}
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
