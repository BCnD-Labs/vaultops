import type { OutlineItem } from "../core/notes/outline";

/** Scrolls the editor to the heading block with this id. */
export function jumpToHeading(id: string) {
	const heading = document.querySelector<HTMLElement>(
		`.note-editor [data-id="${CSS.escape(id)}"]`,
	);
	if (!heading) return;
	const calm = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
	heading.scrollIntoView({
		block: "start",
		behavior: calm ? "auto" : "smooth",
	});
}

export function OutlinePanel({ items }: { items: OutlineItem[] }) {
	if (items.length === 0)
		return (
			<p>No headings yet. Type / and pick a heading to build an outline.</p>
		);
	return (
		<nav aria-label="Note outline">
			<ul className="outline-list">
				{items.map((item, index) => (
					<li key={item.id ?? `${index}:${item.text}`}>
						<button
							type="button"
							className="outline-item"
							data-level={item.level}
							disabled={!item.id}
							onClick={() => item.id && jumpToHeading(item.id)}
						>
							{item.text}
						</button>
					</li>
				))}
			</ul>
		</nav>
	);
}
