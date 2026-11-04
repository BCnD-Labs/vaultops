import { Ellipsis } from "lucide-react";
import {
	type DragEvent,
	Fragment,
	type ReactNode,
	useEffect,
	useRef,
} from "react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Block, JsonValue } from "../core/note-format";
import {
	BLOCK_DRAG_TYPE,
	setBlockDragImage,
	setDragEffect,
} from "../editor/block-drag";

function inline(value: JsonValue | undefined): ReactNode {
	if (!Array.isArray(value)) return null;
	return value.map((part) => {
		if (!part || typeof part !== "object" || Array.isArray(part)) return null;
		const text = typeof part.text === "string" ? part.text : "";
		const marks = Array.isArray(part.marks) ? part.marks : [];
		let content: ReactNode =
			text || (part.type === "hardBreak" ? <br /> : null);
		for (const mark of marks) {
			if (!mark || typeof mark !== "object" || Array.isArray(mark)) continue;
			if (mark.type === "bold") content = <strong>{content}</strong>;
			if (mark.type === "italic") content = <em>{content}</em>;
			if (mark.type === "code") content = <code>{content}</code>;
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
	const preview = useRef<HTMLElement | null>(null);
	useEffect(() => {
		const clearPreview = () => {
			preview.current?.remove();
			preview.current = null;
		};
		document.addEventListener("dragend", clearPreview);
		document.addEventListener("drop", clearPreview);
		return () => {
			document.removeEventListener("dragend", clearPreview);
			document.removeEventListener("drop", clearPreview);
			clearPreview();
		};
	}, []);
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
				preview.current?.remove();
				const ghost = event.currentTarget.cloneNode(true) as HTMLElement;
				ghost.classList.add("canvas-card-drag-preview");
				ghost.querySelector(".canvas-menu")?.remove();
				document.body.append(ghost);
				setBlockDragImage(event.dataTransfer, ghost);
				preview.current = ghost;
			}}
			onDragEnd={() => {
				preview.current?.remove();
				preview.current = null;
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
