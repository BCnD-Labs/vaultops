import type { Editor } from "@tiptap/core";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { type HighlightItem, highlightColors } from "../core/notes/highlights";

function jump(item: HighlightItem) {
	const dom = document.querySelector<HTMLElement & { editor?: Editor }>(
		'.workspace-pane[data-focused="true"] .note-editor .ProseMirror',
	);
	const editor = dom?.editor;
	if (!editor) return;
	editor.state.doc.descendants((node, pos) => {
		if (node.attrs.id !== item.blockId || item.offset >= node.content.size)
			return;
		const from = pos + 1 + item.offset;
		if (
			node.textBetween(
				item.offset,
				Math.min(node.content.size, item.offset + item.text.length),
			) === item.text
		)
			editor
				.chain()
				.focus()
				.setTextSelection({ from, to: from + item.text.length })
				.scrollIntoView()
				.run();
		return false;
	});
}

export function HighlightsPanel({ items }: { items: HighlightItem[] }) {
	const [filter, setFilter] = useState("");
	const activeFilter = items.some((item) => item.color === filter)
		? filter
		: "";
	if (!items.length)
		return <p>Select text and choose Highlight in the formatting toolbar.</p>;
	return (
		<section aria-label="Note highlights">
			<fieldset aria-label="Filter highlights">
				{highlightColors
					.filter((c) => items.some((i) => i.color === c))
					.map((color) => (
						<Button
							key={color}
							variant="ghost"
							size="sm"
							aria-pressed={filter === color}
							onClick={() => setFilter(filter === color ? "" : color)}
						>
							{color}
						</Button>
					))}
			</fieldset>
			<ul className="outline-list">
				{items
					.filter((i) => !activeFilter || i.color === activeFilter)
					.map((item) => (
						<li key={item.blockId + ":" + item.offset}>
							<button
								type="button"
								className="outline-item"
								onClick={() => jump(item)}
							>
								<span
									className="highlight-dot"
									data-color={item.color}
									role="img"
									aria-label={item.color}
								>
									●
								</span>{" "}
								{item.text.length > 120
									? item.text.slice(0, 119) + "…"
									: item.text}
							</button>
						</li>
					))}
			</ul>
		</section>
	);
}
