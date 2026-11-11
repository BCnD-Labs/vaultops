import { ChevronRight } from "lucide-react";
import { useState } from "react";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { filterNotes, groupNotes, type NoteFilter } from "../core/notes/list";
import { NoteListRow } from "./NoteListRow";
import { noteSections } from "./note-sections";
import type { NoteRow } from "./session";

export function NoteList({
	notes,
	vault,
	livePath,
	locked,
	searching,
	onOpen,
	onTrash,
}: {
	notes: NoteRow[];
	vault: string;
	livePath: string | null;
	locked: boolean;
	searching: boolean;
	onOpen: (path: string) => void;
	onTrash?: (path: string) => void;
}) {
	const [filter, setFilter] = useState<NoteFilter>("All");
	const [collapsed, setCollapsed] = useState(() => noteSections(vault));
	const filtered = filterNotes(notes, filter);
	return (
		<>
			<fieldset className="note-filter-tabs" aria-label="Filter notes">
				{(["All", "Tagged", "Untagged"] as const).map((tab) => (
					<button
						key={tab}
						type="button"
						aria-pressed={filter === tab}
						onClick={() => setFilter(tab)}
					>
						{filter === tab ? `[${tab}]` : tab}
					</button>
				))}
			</fieldset>
			<ScrollArea className="navigation-scroll">
				{groupNotes(filtered).map(([folder, rows]) => (
					<Collapsible
						key={folder}
						className="note-section"
						open={!collapsed.includes(folder)}
						onOpenChange={(open) =>
							setCollapsed((previous) =>
								noteSections(
									vault,
									open
										? previous.filter((path) => path !== folder)
										: [...previous, folder],
								),
							)
						}
					>
						<CollapsibleTrigger className="note-section-header">
							<ChevronRight
								className="tree-icon tree-chevron"
								aria-hidden="true"
							/>
							<span className="tree-name">{folder || "Vault root"}</span>
							<span className="note-section-count">{rows.length}</span>
						</CollapsibleTrigger>
						<CollapsibleContent>
							<ul className="note-list note-rows">
								{rows.map((note) => (
									<NoteListRow
										key={note.path}
										note={note}
										current={note.path === livePath}
										locked={locked}
										onOpen={onOpen}
										onTrash={onTrash}
									/>
								))}
							</ul>
						</CollapsibleContent>
					</Collapsible>
				))}
				{filtered.length === 0 && (
					<p className="read-only-tag">
						{searching || filter !== "All"
							? "No notes match."
							: "No notes here yet."}
					</p>
				)}
			</ScrollArea>
		</>
	);
}
