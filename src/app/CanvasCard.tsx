import { Fragment, type ReactNode } from "react";
import type { Block, JsonValue } from "../core/note-format";

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
	onMoveToNote,
}: {
	root: Block;
	blocks: Block[];
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
	return (
		<article className="canvas-card">
			{render(root)}
			{onMoveToNote && (
				<button
					type="button"
					className="canvas-return nodrag"
					onClick={onMoveToNote}
				>
					Move to open note
				</button>
			)}
		</article>
	);
}
