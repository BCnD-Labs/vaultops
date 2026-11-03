import { LayoutDashboard } from "lucide-react";
import { visibleTags } from "../core/notes/list";
import { DRAG_TYPE } from "./NoteTree";
import type { NoteRow } from "./session";

export function NoteListRow({
	note,
	current,
	locked,
	onOpen,
}: {
	note: NoteRow;
	current: boolean;
	locked: boolean;
	onOpen: (path: string) => void;
}) {
	const { shown, overflow } = visibleTags(note.tags);
	return (
		<li className="note-list-entry">
			<button
				type="button"
				className="note-list-row"
				title={note.path}
				draggable={!locked}
				aria-current={current}
				onClick={() => onOpen(note.path)}
				onDragStart={(event) => {
					event.dataTransfer.setData(
						DRAG_TYPE,
						JSON.stringify({
							kind: "note",
							path: note.path,
							readOnly: note.readOnly,
						}),
					);
					event.dataTransfer.effectAllowed = "move";
				}}
			>
				<span className="note-row-heading">
					{note.kind === "canvas" && (
						<LayoutDashboard className="tree-icon" aria-label="Canvas" />
					)}
					<span className="note-row-title">{note.title}</span>
					<span className="note-row-chips">
						{shown.map((tag) => (
							<span className="note-tag-chip" key={tag}>
								#{tag}
							</span>
						))}
						{overflow > 0 && <span className="note-tag-chip">+{overflow}</span>}
					</span>
				</span>
				<span className="note-row-preview">{note.preview}</span>
				{note.readOnly && <span className="note-row-meta">read-only</span>}
			</button>
		</li>
	);
}
