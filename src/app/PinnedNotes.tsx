import { ChevronRight, FileText, LayoutDashboard, PinOff } from "lucide-react";
import { type DragEvent, useState } from "react";
import { useAppearance } from "./AppearanceContext";
import { ICON_BY_NAME, resolveIcon } from "./iconCatalog";
import { DRAG_TYPE, readDrag } from "./NoteTree";
import type { NoteRow } from "./session";
import { TreeRowMenu } from "./TreeRowMenu";

const PIN = "application/x-vaultops-pin";

export function PinnedNotes({
	rows,
	notes,
	livePath,
	locked,
	onOpen,
	place,
}: {
	rows: NoteRow[];
	notes: NoteRow[];
	livePath: string | null;
	locked: boolean;
	onOpen: (path: string) => void;
	place: (id: string, index: number | null) => void;
}) {
	const [expanded, setExpanded] = useState(true);
	const { appearance } = useAppearance();
	const target = (index: number) => ({
		onDragOver(e: DragEvent) {
			e.stopPropagation();
			if (
				!locked &&
				[PIN, DRAG_TYPE].some((type) => e.dataTransfer.types.includes(type))
			)
				e.preventDefault();
		},
		onDrop(e: DragEvent) {
			e.preventDefault();
			e.stopPropagation();
			if (locked) return;
			const item = readDrag(e);
			const note =
				item?.kind === "note"
					? notes.find((n) => n.path === item.path && !n.readOnly)
					: rows.find((n) => n.id === e.dataTransfer.getData(PIN));
			if (note?.id) place(note.id, index);
		},
	});
	return (
		<section className="pinned-notes" aria-label="Pinned notes">
			<button
				type="button"
				className="sidebar-row section-label"
				aria-expanded={expanded}
				onClick={() => setExpanded(!expanded)}
				{...target(rows.length)}
			>
				<ChevronRight
					className={`tree-icon tree-chevron${expanded ? " is-open" : ""}`}
				/>
				Pinned
			</button>
			{expanded &&
				rows.map((note, index) => {
					const id = note.id;
					if (!id) return null;
					const Icon =
						resolveIcon(appearance.items[note.path]?.icon ?? "") ??
						ICON_BY_NAME.get(note.icon ?? "") ??
						(note.kind === "canvas" ? LayoutDashboard : FileText);
					return (
						<TreeRowMenu
							key={id}
							disabled={locked}
							entries={[
								{
									label: "Unpin note",
									icon: PinOff,
									run: () => place(id, null),
								},
							]}
						>
							<button
								type="button"
								className="sidebar-row"
								title={note.path}
								aria-current={livePath === note.path}
								onClick={() => onOpen(note.path)}
								draggable={!locked}
								onDragStart={(e) => {
									e.dataTransfer.setData(PIN, id);
									e.dataTransfer.effectAllowed = "move";
								}}
								{...target(index)}
								onKeyDown={(e) => {
									if (locked || !e.shiftKey || !e.altKey) return;
									const direction = ["ArrowUp", "ArrowLeft"].includes(e.key)
										? -1
										: ["ArrowDown", "ArrowRight"].includes(e.key)
											? 1
											: 0;
									if (!direction) return;
									e.preventDefault();
									const next = index + direction;
									if (next >= 0 && next < rows.length) place(id, next);
								}}
							>
								<Icon className="tree-icon" />
								<span className="tree-name">{note.title}</span>
							</button>
						</TreeRowMenu>
					);
				})}
		</section>
	);
}
