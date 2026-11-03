import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { notesWithTag, tagIndex } from "../core/notes/tags";

interface Row {
	path: string;
	title: string;
	tags: string[];
}

/** Every tag in the vault with its note count; clicking one lists its notes. */
export function TagIndex(props: {
	rows: Row[];
	active: string | null;
	onPick: (tag: string) => void;
}) {
	const tags = tagIndex(props.rows);
	if (tags.length === 0) return null;
	return (
		<nav className="tag-index" aria-label="Tags">
			{tags.map(({ tag, count }) => (
				<button
					key={tag}
					type="button"
					className="sidebar-row tag-button"
					aria-pressed={props.active?.toLowerCase() === tag.toLowerCase()}
					onClick={() => props.onPick(tag)}
				>
					<span className="tree-name">#{tag}</span>{" "}
					<span className="sidebar-count">{count}</span>
				</button>
			))}
		</nav>
	);
}

/** The notes that carry one tag, in place of the folder tree. */
export function TaggedNotes(props: {
	rows: Row[];
	tag: string;
	livePath: string | null;
	onOpen: (path: string) => void;
	onClear: () => void;
}) {
	const notes = notesWithTag(props.rows, props.tag);
	return (
		<div className="tagged">
			<p className="tagged-title">
				Notes tagged <strong>{props.tag}</strong>
			</p>
			<ul className="note-list">
				{notes.map((n) => (
					<li key={n.path} title={n.path}>
						<button
							type="button"
							aria-current={n.path === props.livePath}
							onClick={() => props.onOpen(n.path)}
						>
							<FileText className="tree-icon" aria-hidden="true" />
							<span className="tree-name">{n.title}</span>
						</button>
					</li>
				))}
			</ul>
			{notes.length === 0 && (
				<p className="read-only-tag">No notes carry this tag.</p>
			)}
			<Button size="sm" variant="secondary" onClick={props.onClear}>
				Show all notes
			</Button>
		</div>
	);
}
