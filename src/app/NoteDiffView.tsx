import { type NoteDiff, wordChanges } from "../core/history/diff";

const label = (type: string) =>
	({
		paragraph: "paragraph",
		heading: "heading",
		taskItem: "task",
		callout: "callout",
	})[type] ?? type;

/**
 * A note's changes shown like tracked changes: added words underlined in
 * green, removed words struck through in red, and title, property and tag
 * changes listed above.
 */
export function NoteDiffView({ diff }: { diff: NoteDiff }) {
	if (diff.same) return <p className="settings-note">No changes.</p>;
	return (
		<section className="note-diff" aria-label="Changes">
			{(diff.title ||
				diff.props.length > 0 ||
				diff.tagsAdded.length > 0 ||
				diff.tagsRemoved.length > 0) && (
				<ul className="note-diff-header">
					{diff.title && (
						<li>
							Title: <del>{diff.title.before}</del> →{" "}
							<ins>{diff.title.after}</ins>
						</li>
					)}
					{diff.props.map((p) => (
						<li key={p.name}>
							{p.name}:{" "}
							{p.kind === "added" ? (
								<ins>{p.after}</ins>
							) : p.kind === "removed" ? (
								<del>{p.before}</del>
							) : (
								<>
									<del>{p.before}</del> → <ins>{p.after}</ins>
								</>
							)}
						</li>
					))}
					{diff.tagsAdded.map((t) => (
						<li key={`+${t}`}>
							Tag added: <ins>{t}</ins>
						</li>
					))}
					{diff.tagsRemoved.map((t) => (
						<li key={`-${t}`}>
							Tag removed: <del>{t}</del>
						</li>
					))}
				</ul>
			)}
			{diff.blocks.map((b) => (
				<div key={b.id} className="note-diff-block" data-kind={b.kind}>
					{b.kind === "added" && (
						<ins>{b.after || `(${label(b.type)} added)`}</ins>
					)}
					{b.kind === "removed" && (
						<del>{b.before || `(${label(b.type)} removed)`}</del>
					)}
					{(b.kind === "changed" || b.kind === "retyped") &&
						(b.before || b.after ? (
							wordChanges(b.before, b.after).map((part, i) =>
								part.kind === "added" ? (
									// biome-ignore lint/suspicious/noArrayIndexKey: parts have no other identity and never reorder.
									<ins key={i}>{part.text}</ins>
								) : part.kind === "removed" ? (
									// biome-ignore lint/suspicious/noArrayIndexKey: as above.
									<del key={i}>{part.text}</del>
								) : (
									// biome-ignore lint/suspicious/noArrayIndexKey: as above.
									<span key={i}>{part.text}</span>
								),
							)
						) : (
							<span className="settings-note">({label(b.type)} changed)</span>
						))}
					{b.kind === "moved" && <span>{b.after}</span>}
					{(b.kind === "retyped" || b.moved) && (
						<span className="note-diff-note">
							{b.kind === "retyped" &&
								` · ${label(b.beforeType ?? "")} → ${label(b.type)}`}
							{b.moved && " · moved"}
						</span>
					)}
				</div>
			))}
		</section>
	);
}
