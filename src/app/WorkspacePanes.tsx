import {
	type ReactNode,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import {
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
} from "@/components/ui/resizable";
import { NEW_TAB, type PaneId } from "../core/workspace";
import { setDragEffect } from "../editor/block-drag";
import { ShellNavigation } from "./AppShell";
import type { NoteRow } from "./session";
import { TabBar, type TabItem } from "./TabBar";
import {
	hasTabDrag,
	landingIndex,
	nudgeTab,
	type TabDrag,
	tabDragData,
} from "./tab-drag";
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
	/** The title bar under a pane's tab strip, for the document it shows. */
	renderTitleBar?: (pane: PaneView, doc: PaneDoc) => ReactNode;
}

/** What a pane's title bar says about the tab being shown. */
export interface PaneDoc {
	/** The note's or canvas's path; null for the empty tab. */
	path: string | null;
	title: string | null;
	focused: boolean;
	/** The pane at the window's right end (it carries the calendar button). */
	last: boolean;
}

const other = (id: PaneId): PaneId => (id === "left" ? "right" : "left");

/**
 * The editor column: one pane, or two side by side, each with its own tab strip
 * and its own document. It only lays things out and passes tab commands to the
 * workspace host; what a note, a canvas or the empty tab looks like inside a
 * pane is up to the caller. Clicking in a pane focuses it.
 *
 * Tabs can be dragged: within a strip to reorder, onto the other pane's strip
 * (or, while the view is split, onto its body) to move there, and onto the right
 * edge of a single pane to open beside. Alt+Shift+Left or Right does the same
 * from the keyboard.
 */
export function WorkspacePanes({
	host,
	notes,
	renderNote,
	renderCanvas,
	renderEmpty,
	renderTitleBar,
}: WorkspacePanesProps) {
	const { left, right } = host.panes;
	const { leftCollapsed, rightCollapsed } = useContext(ShellNavigation);
	const split = right !== null;
	const rows = useMemo(() => new Map(notes.map((n) => [n.path, n])), [notes]);
	// The tab being dragged (drop zones show only then) and the zone it is over.
	const [dragging, setDragging] = useState<TabDrag | null>(null);
	const [over, setOver] = useState<PaneId | null>(null);
	// A moved tab loses keyboard focus when its node moves; hand it back.
	const [focusTab, setFocusTab] = useState<string | null>(null);
	useEffect(() => {
		if (focusTab !== null) setFocusTab(null);
	}, [focusTab]);

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

	const docOf = (pane: PaneView): PaneDoc => {
		const shown = pane.active && pane.active !== NEW_TAB ? pane.active : null;
		const item = tabsOf(pane).find((tab) => tab.path === shown);
		return {
			path: shown,
			title: shown ? (item?.title ?? null) : null,
			focused: host.focused === pane.id,
			last: split ? pane.id === "right" : true,
		};
	};

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

	// The zones appear a moment after the drag starts: changing the page inside
	// dragstart makes some engines (Safari's, Chromium) cancel the drag at once.
	const startTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const startDrag = (drag: TabDrag) => {
		if (startTimer.current !== null) clearTimeout(startTimer.current);
		startTimer.current = setTimeout(() => {
			startTimer.current = null;
			setDragging(drag);
		}, 0);
	};
	useEffect(
		() => () => {
			if (startTimer.current !== null) clearTimeout(startTimer.current);
		},
		[],
	);

	const endDrag = () => {
		if (startTimer.current !== null) {
			clearTimeout(startTimer.current);
			startTimer.current = null;
		}
		setDragging(null);
		setOver(null);
	};

	// Move a dropped tab into a pane at a place in that pane's strip.
	const dropOn = (drag: TabDrag, pane: PaneView, index: number) => {
		endDrag();
		void host.moveTab(
			drag.path,
			pane.id,
			landingIndex(pane.tabs, drag, pane.id, index),
		);
	};

	const nudge = async (pane: PaneView, path: string, direction: -1 | 1) => {
		const step = nudgeTab(pane.id, pane.tabs, path, direction, split);
		if (!step) return;
		const moved =
			step.kind === "reorder"
				? await host.moveTab(path, pane.id, step.index)
				: await host.moveTab(path, step.to, step.index);
		if (moved) setFocusTab(path);
	};

	// While a tab is dragged: the right edge of a single pane opens beside, and
	// the other pane's body takes the tab.
	const zone = (pane: PaneView): ReactNode => {
		if (!dragging) return null;
		const edge =
			!split &&
			pane.id === "left" &&
			dragging.from === "left" &&
			pane.tabs.length > 1;
		if (!edge && !(split && dragging.from !== pane.id)) return null;
		return (
			// biome-ignore lint/a11y/noStaticElementInteractions: a pointer-only drop target; the keyboard route is Alt+Shift+Arrow on a tab
			<div
				className="pane-drop-zone"
				data-edge={edge || undefined}
				data-over={over === pane.id || undefined}
				onDragOver={(event) => {
					if (!hasTabDrag(event.dataTransfer)) return;
					event.preventDefault();
					setDragEffect(event.dataTransfer, "dropEffect", "move");
					setOver(pane.id);
				}}
				onDragLeave={() => setOver(null)}
				onDrop={(event) => {
					event.preventDefault();
					const drag = tabDragData(event.dataTransfer);
					endDrag();
					if (drag) void host.moveTab(drag.path, edge ? "right" : pane.id);
				}}
			>
				{edge ? "Drop to open beside" : "Move here"}
			</div>
		);
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
				data-clear-left={(pane.id === "left" && leftCollapsed) || undefined}
				data-clear-right={
					((split ? pane.id === "right" : true) && rightCollapsed) || undefined
				}
				onPointerDownCapture={() => focus(pane.id)}
				onFocusCapture={() => focus(pane.id)}
			>
				{pane.tabs.length > 0 && (
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
						onDropTab={(drag, index) => dropOn(drag, pane, index)}
						onTabDragStart={startDrag}
						onTabDragEnd={endDrag}
						onNudge={(path, direction) => void nudge(pane, path, direction)}
						focusRequest={focusTab}
					/>
				)}
				{renderTitleBar?.(pane, docOf(pane))}
				{content(pane)}
				{zone(pane)}
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
