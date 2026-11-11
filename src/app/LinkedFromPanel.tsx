import { FileText, LayoutDashboard } from "lucide-react";
import type { NoteRow } from "./session";

/** The notes and canvases that link to the note with this `noteId`, by title. */
export function linkedFrom(
	notes: readonly NoteRow[],
	noteId: string | undefined,
): NoteRow[] {
	if (!noteId) return [];
	return notes
		.filter((row) => row.id !== noteId && row.links?.includes(noteId))
		.sort((a, b) =>
			a.title.localeCompare(b.title, undefined, { sensitivity: "base" }),
		);
}

/** "Linked from": who points here. Reading only; opening one is the only action. */
export function LinkedFromPanel({
	rows,
	onOpen,
}: {
	rows: NoteRow[];
	onOpen: (path: string) => void;
}) {
	if (rows.length === 0)
		return (
			<p>
				Nothing links here yet. In another note, type [[ and pick this one to
				link to it.
			</p>
		);
	return (
		<nav aria-label="Linked from">
			<ul className="outline-list">
				{rows.map((row) => {
					const Icon = row.kind === "canvas" ? LayoutDashboard : FileText;
					return (
						<li key={row.path}>
							<button
								type="button"
								className="outline-item"
								data-level={1}
								onClick={() => onOpen(row.path)}
							>
								<Icon className="tree-icon" aria-hidden="true" /> {row.title}
							</button>
						</li>
					);
				})}
			</ul>
		</nav>
	);
}
