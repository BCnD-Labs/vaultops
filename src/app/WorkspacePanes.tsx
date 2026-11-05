import { type ReactNode, useMemo } from "react";
import {
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
} from "@/components/ui/resizable";
import { NEW_TAB, type PaneId } from "../core/workspace";
import type { NoteRow } from "./session";
import { TabBar, type TabItem } from "./TabBar";
import type { PaneView, WorkspaceHost } from "./useWorkspaceHost";
import "./pane.css";

export interface WorkspacePanesProps {
	host: WorkspaceHost;
	/** The vault's notes and canvases, for tab titles and canvas icons. */
	notes: Pick<NoteRow, "path" | "title" | "kind">[];
	/** What a pane shows for a note that is loaded (`pane.session` holds it). */
	renderNote: (pane: PaneView) => ReactNode;
	renderCanvas: (path: string, pane: PaneView) => ReactNode;
	/** The empty tab, or a pane with no tab at all. */
	renderEmpty: (pane: PaneView) => ReactNode;
}

const other = (id: PaneId): PaneId => (id === "left" ? "right" : "left");

/**
 * The editor column: one pane, or two side by side, each with its own tab strip
 * and its own document. It only lays things out and passes tab commands to the
 * workspace host; what a note, a canvas or the empty tab looks like inside a
 * pane is up to the caller. Clicking in a pane focuses it.
 */
export function WorkspacePanes({
	host,
	notes,
	renderNote,
	renderCanvas,
	renderEmpty,
}: WorkspacePanesProps) {
	const { left, right } = host.panes;
	const split = right !== null;
	const rows = useMemo(() => new Map(notes.map((n) => [n.path, n])), [notes]);

	const tabsOf = (pane: PaneView): TabItem[] =>
		pane.tabs.map((path) => {
			const active = pane.active === path;
			if (path === NEW_TAB) return { path, title: "New tab", active };
			const row = rows.get(path);
			const canvas = row?.kind === "canvas";
			const name =
				path
					.split("/")
					.pop()
					?.replace(/\.vnote$/, "") ?? path;
			// The note being edited shows its live title, before it is saved.
			const live = active && !canvas && pane.ready ? pane.session.title : "";
			return { path, title: live || row?.title || name, active, canvas };
		});

	const content = (pane: PaneView): ReactNode => {
		if (pane.kind === "canvas" && pane.active)
			return renderCanvas(pane.active, pane);
		if (pane.kind !== "note") return renderEmpty(pane);
		return pane.ready ? (
			renderNote(pane)
		) : (
			<main className="pane">
				<p className="empty-pane" role="status">
					Opening the note…
				</p>
			</main>
		);
	};

	const focus = (id: PaneId) => {
		if (host.focused !== id) host.focus(id);
	};

	const column = (pane: PaneView) => {
		// Moving needs somewhere to go: a lone tab can't leave a single pane.
		const canMove = split || pane.tabs.length > 1;
		return (
			<div
				className="pane-column workspace-pane"
				data-pane-id={pane.id}
				data-focused={host.focused === pane.id}
				data-split={split}
				onPointerDownCapture={() => focus(pane.id)}
				onFocusCapture={() => focus(pane.id)}
			>
				<TabBar
					paneId={pane.id}
					label={pane.id === "left" ? "Open notes" : "Open notes, right side"}
					tabs={tabsOf(pane)}
					onSelect={(path) => void host.select(pane.id, path)}
					onClose={(path) => void host.close(path, pane.id)}
					onNew={() => void host.newTab(pane.id)}
					onSplit={(path) => void host.split(path)}
					onMove={
						canMove
							? (path) => void host.moveTab(path, other(pane.id))
							: undefined
					}
					moveLabel={`Move to ${other(pane.id)} side`}
					splitOpen={split}
					onCloseSplit={() => void host.closeSplit()}
				/>
				{content(pane)}
			</div>
		);
	};

	return (
		// The group is rebuilt when the split opens or closes, as the app does today.
		<ResizablePanelGroup
			key={split ? "split" : "single"}
			orientation="horizontal"
			className="editor-split"
		>
			<ResizablePanel id="left" minSize="25%">
				{column(left)}
			</ResizablePanel>
			{right && (
				<>
					<ResizableHandle />
					<ResizablePanel id="right" minSize="25%">
						{column(right)}
					</ResizablePanel>
				</>
			)}
		</ResizablePanelGroup>
	);
}
