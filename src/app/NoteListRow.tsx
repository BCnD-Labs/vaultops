import { LayoutDashboard, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { visibleTags } from "../core/notes/list";
import { DRAG_TYPE } from "./NoteTree";
import type { NoteRow } from "./session";

export function NoteListRow({
	note,
	current,
	locked,
	onOpen,
	onTrash,
}: {
	note: NoteRow;
	current: boolean;
	locked: boolean;
	onOpen: (path: string) => void;
	/** Moves the note or canvas to the trash, after the row asks to confirm. */
	onTrash?: (path: string) => void;
}) {
	const { shown, overflow } = visibleTags(note.tags);
	const [confirming, setConfirming] = useState(false);
	const kind = note.kind === "canvas" ? "canvas" : "note";
	if (confirming && onTrash) {
		return (
			<li className="note-list-entry">
				<div className="tree-confirm" role="alert">
					<p>
						Move <strong>{note.title}</strong> to the trash? You can restore it
						from the trash.
					</p>
					<div className="tree-confirm-buttons">
						<Button
							size="sm"
							variant="destructive"
							onClick={() => {
								setConfirming(false);
								onTrash(note.path);
							}}
						>
							Move to trash
						</Button>
						<Button
							size="sm"
							variant="secondary"
							onClick={() => setConfirming(false)}
						>
							Cancel
						</Button>
					</div>
				</div>
			</li>
		);
	}
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
			{onTrash && (
				<span className="tree-actions">
					<button
						type="button"
						className="tree-action"
						aria-label={`Move ${kind} ${note.title} to the trash`}
						title="Move to trash"
						disabled={locked}
						onClick={() => setConfirming(true)}
					>
						<Trash2 className="tree-icon" aria-hidden="true" />
					</button>
				</span>
			)}
		</li>
	);
}
