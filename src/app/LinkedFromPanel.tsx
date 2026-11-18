import { ChevronRight, FileText, LayoutDashboard } from "lucide-react";
import { type ReactNode, useState } from "react";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { localGraph, mentionsOf } from "../core/links/mentions";
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

/** Connections for the open note: incoming links, unlinked mentions, and a local graph. */
export function LinkedFromPanel({
	rows,
	notes = [],
	noteId,
	title,
	onOpen,
}: {
	rows: NoteRow[];
	notes?: readonly NoteRow[];
	noteId?: string;
	title?: string;
	onOpen: (path: string) => void;
}) {
	const [hovered, setHovered] = useState<string | null>(null);
	const mentions = mentionsOf(notes, noteId, title);
	const graph = localGraph(notes, noteId);
	const hover = (id: string | null) => () => setHovered(id);
	const section = (
		label: string,
		count: number,
		empty: string,
		body: ReactNode,
	) => (
		<Collapsible defaultOpen className="note-section">
			<CollapsibleTrigger className="note-section-header">
				<ChevronRight className="tree-icon tree-chevron" aria-hidden="true" />
				<span className="tree-name">{label}</span>
				<span className="note-section-count">{count}</span>
			</CollapsibleTrigger>
			<CollapsibleContent>
				{count === 0 ? <p>{empty}</p> : body}
			</CollapsibleContent>
		</Collapsible>
	);
	return (
		<div className="connections-panel">
			{section(
				"Linked from",
				rows.length,
				"Nothing links here yet. In another note, type [[ and pick this one to link to it.",
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
										<Icon className="tree-icon" aria-hidden="true" />{" "}
										{row.title}
									</button>
								</li>
							);
						})}
					</ul>
				</nav>,
			)}
			{section(
				"Mentions",
				mentions.length,
				"No unlinked mentions found.",
				<ul className="outline-list">
					{mentions.map(({ note, snippet }) => (
						<li key={note.path}>
							<button
								type="button"
								className="outline-item"
								data-level={1}
								onClick={() => onOpen(note.path)}
							>
								<FileText className="tree-icon" aria-hidden="true" />{" "}
								{note.title}
							</button>
							<p className="connections-snippet">{snippet}</p>
						</li>
					))}
				</ul>,
			)}
			{section(
				"Graph",
				graph.nodes.length,
				"No local graph to show.",
				<svg
					viewBox="0 0 220 220"
					className="connections-graph"
					role="img"
					aria-label="Local graph"
				>
					{graph.edges.map((e) => (
						<line
							key={`${e.from}:${e.to}`}
							className="connections-edge"
							x1={e.x1}
							y1={e.y1}
							x2={e.x2}
							y2={e.y2}
							data-highlighted={
								hovered === e.from || hovered === e.to ? "true" : undefined
							}
						/>
					))}
					{graph.nodes.map((n) => (
						<a
							key={n.id}
							href={`#${n.id}`}
							aria-label={n.title}
							className="connections-node"
							data-hop={n.hop}
							style={{ transform: `translate(${n.x}px, ${n.y}px)` }}
							onClick={(e) => {
								e.preventDefault();
								onOpen(n.path);
							}}
							onMouseEnter={hover(n.id)}
							onMouseLeave={hover(null)}
							onFocus={hover(n.id)}
							onBlur={hover(null)}
						>
							<circle r={n.hop === 0 ? 7 : n.hop === 1 ? 5 : 4} />
							<text y={14} textAnchor="middle">
								{n.title.slice(0, 18)}
							</text>
						</a>
					))}
				</svg>,
			)}
		</div>
	);
}
