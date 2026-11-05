import { LayoutDashboard, Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { setDragEffect } from "../editor/block-drag";
import {
	dropIndex,
	hasTabDrag,
	setTabDrag,
	type TabDrag,
	tabDragData,
} from "./tab-drag";
import { NEW_TAB } from "./tabs";

export interface TabItem {
	path: string;
	title: string;
	active: boolean;
	/** A canvas rather than a note: shown with a canvas icon. */
	canvas?: boolean;
}

/**
 * The open notes as tabs, along the top of the editor column. Selecting a tab
 * opens that note; the x (or a middle click) closes it; "+" opens an empty tab
 * (the NEW_TAB item) that offers to create or open something.
 */
export function TabBar({
	tabs,
	onSelect,
	onClose,
	onNew,
	onSplit,
	onMove,
	moveLabel = "Move to other side",
	onDropTab,
	onTabDragStart,
	onTabDragEnd,
	onNudge,
	focusRequest = null,
	splitOpen = false,
	onCloseSplit,
	label = "Open notes",
	paneId,
}: {
	tabs: TabItem[];
	onSelect: (path: string) => void;
	onClose: (path: string) => void;
	onNew: () => void;
	/** Right-click a note or canvas tab, "Split view". */
	onSplit?: (path: string) => void;
	/** Right-click a note or canvas tab, "Move to other side" (named by `moveLabel`). */
	onMove?: (path: string) => void;
	moveLabel?: string;
	/**
	 * A tab dragged here (from this strip or another) was dropped. `index` is the
	 * place in this strip's own tab order, before any tab is taken out. Giving
	 * this makes the tabs draggable (they need `paneId` to say where they came from).
	 */
	onDropTab?: (drag: TabDrag, index: number) => void;
	onTabDragStart?: (drag: TabDrag) => void;
	onTabDragEnd?: () => void;
	/** Alt+Shift+Left or Right on a focused tab: the keyboard way to move it. */
	onNudge?: (path: string, direction: -1 | 1) => void;
	/** Focus this tab's label when it is in the strip (after a move that lost focus). */
	focusRequest?: string | null;
	splitOpen?: boolean;
	onCloseSplit?: () => void;
	/** The tab list's accessible name (a split view has one list per side). */
	label?: string;
	/** Set on a split view's tab strips: which side this strip belongs to. */
	paneId?: "left" | "right";
}) {
	const active = useRef<HTMLDivElement | null>(null);
	const list = useRef<HTMLDivElement | null>(null);
	const activePath = tabs.find((tab) => tab.active)?.path;
	// Where a dragged tab would land, while one is over the strip.
	const [dropAt, setDropAt] = useState<number | null>(null);
	const draggable = !!onDropTab && !!paneId;
	// biome-ignore lint/correctness/useExhaustiveDependencies: scroll when the active tab changes
	useEffect(() => {
		active.current?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
	}, [activePath]);
	useEffect(() => {
		if (focusRequest === null) return;
		const labels = list.current?.querySelectorAll<HTMLElement>("[data-path]");
		for (const node of labels ?? [])
			if (node.dataset.path === focusRequest) node.focus();
	}, [focusRequest]);
	const indexAt = (x: number) => {
		const nodes = list.current?.querySelectorAll<HTMLElement>(".tab") ?? [];
		return dropIndex(
			Array.from(nodes, (node) => {
				const box = node.getBoundingClientRect();
				return box.left + box.width / 2;
			}),
			x,
		);
	};
	return (
		<div className="tab-bar" data-pane={paneId}>
			<div
				ref={list}
				className="tab-list"
				role="tablist"
				aria-label={label}
				data-drop-end={dropAt === tabs.length ? true : undefined}
				onDragOver={(event) => {
					if (!onDropTab || !hasTabDrag(event.dataTransfer)) return;
					event.preventDefault();
					setDragEffect(event.dataTransfer, "dropEffect", "move");
					setDropAt(indexAt(event.clientX));
				}}
				onDragLeave={(event) => {
					if (!list.current?.contains(event.relatedTarget as Node | null))
						setDropAt(null);
				}}
				onDrop={(event) => {
					setDropAt(null);
					const drag = tabDragData(event.dataTransfer);
					if (!onDropTab || !drag) return;
					event.preventDefault();
					onDropTab(drag, indexAt(event.clientX));
				}}
			>
				{tabs.map((tab, index) => {
					const node = (
						// biome-ignore lint/a11y/noStaticElementInteractions: dragging is a pointer path; the keyboard route is Alt+Shift+Arrow on the tab button
						<div
							key={tab.path}
							ref={tab.active ? active : undefined}
							role="presentation"
							className="tab"
							data-active={tab.active}
							data-drop={dropAt === index ? "before" : undefined}
							draggable={draggable && tab.path !== NEW_TAB}
							onDragStart={(event) => {
								if (!draggable || !paneId || tab.path === NEW_TAB) return;
								const drag = { path: tab.path, from: paneId };
								setTabDrag(event.dataTransfer, drag);
								onTabDragStart?.(drag);
							}}
							onDragEnd={() => {
								setDropAt(null);
								onTabDragEnd?.();
							}}
							onAuxClick={(event) => {
								if (event.button !== 1) return;
								event.preventDefault();
								onClose(tab.path);
							}}
						>
							<button
								type="button"
								role="tab"
								className="tab-label"
								data-path={tab.path}
								aria-selected={tab.active}
								title={tab.path === NEW_TAB ? undefined : tab.path}
								onClick={() => onSelect(tab.path)}
								onKeyDown={(event) => {
									if (!onNudge || !event.altKey || !event.shiftKey) return;
									if (event.key !== "ArrowLeft" && event.key !== "ArrowRight")
										return;
									event.preventDefault();
									onNudge(tab.path, event.key === "ArrowLeft" ? -1 : 1);
								}}
							>
								{tab.canvas && (
									<LayoutDashboard className="tab-icon" aria-hidden="true" />
								)}
								{tab.title}
							</button>
							<button
								type="button"
								className="tab-close"
								aria-label={`Close ${tab.title}`}
								onClick={() => onClose(tab.path)}
							>
								<X aria-hidden="true" />
							</button>
						</div>
					);
					if ((!onSplit && !onMove) || tab.path === NEW_TAB) return node;
					return (
						<ContextMenu key={tab.path}>
							<ContextMenuTrigger asChild>{node}</ContextMenuTrigger>
							<ContextMenuContent>
								{onSplit && (
									<ContextMenuItem onSelect={() => onSplit(tab.path)}>
										Split view
									</ContextMenuItem>
								)}
								{onMove && (
									<ContextMenuItem onSelect={() => onMove(tab.path)}>
										{moveLabel}
									</ContextMenuItem>
								)}
								{splitOpen && (
									<ContextMenuItem onSelect={() => onCloseSplit?.()}>
										Close split view
									</ContextMenuItem>
								)}
							</ContextMenuContent>
						</ContextMenu>
					);
				})}
			</div>
			<Button
				variant="ghost"
				size="icon"
				className="tab-new"
				aria-label="New tab"
				title="New tab"
				onClick={onNew}
			>
				<Plus aria-hidden="true" />
			</Button>
		</div>
	);
}
