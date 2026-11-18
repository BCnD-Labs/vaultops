import { ChevronDown, LayoutDashboard, Plus, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { setDragEffect } from "../editor/block-drag";
import { ICON_BY_NAME } from "./iconCatalog";
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
	icon?: string;
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
	const bar = useRef<HTMLDivElement | null>(null);
	const activePath = tabs.find((tab) => tab.active)?.path;
	const [focusPath, setFocusPath] = useState<string | null>(
		activePath ?? tabs[0]?.path ?? null,
	);
	const previousPaths = useRef(tabs.map((tab) => tab.path));
	const focusedControlPath = useRef<string | null>(null);
	const rovingPath = tabs.some((tab) => tab.path === focusPath)
		? focusPath
		: (activePath ?? tabs[0]?.path ?? null);
	// Where a dragged tab would land, while one is over the strip.
	const [dropAt, setDropAt] = useState<number | null>(null);
	// The tab being carried, dimmed in its slot so it and the copy that follows
	// the pointer do not read as two tabs.
	const [carried, setCarried] = useState<string | null>(null);
	const draggable = !!onDropTab && !!paneId;
	useLayoutEffect(() => {
		const lostControl =
			focusedControlPath.current !== null &&
			!tabs.some((tab) => tab.path === focusedControlPath.current);
		const lostRoving =
			focusPath !== null && !tabs.some((tab) => tab.path === focusPath);
		if (lostControl || lostRoving) {
			const removedPath = lostControl ? focusedControlPath.current : focusPath;
			const oldIndex = previousPaths.current.indexOf(removedPath ?? "");
			const next = tabs[Math.min(Math.max(oldIndex, 0), tabs.length - 1)];
			setFocusPath(next?.path ?? null);
			if (lostControl && document.activeElement === document.body) {
				for (const label of list.current?.querySelectorAll<HTMLButtonElement>(
					".tab-label",
				) ?? []) {
					if (label.dataset.path === next?.path) label.focus();
				}
			}
			focusedControlPath.current = next?.path ?? null;
		}
		previousPaths.current = tabs.map((tab) => tab.path);
	}, [tabs, focusPath]);
	// biome-ignore lint/correctness/useExhaustiveDependencies: scroll when the active tab changes
	useEffect(() => {
		active.current?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
	}, [activePath]);
	useEffect(() => {
		if (focusRequest === null) return;
		const labels = list.current?.querySelectorAll<HTMLElement>("[data-path]");
		for (const node of labels ?? [])
			if (node.dataset.path === focusRequest) {
				node.focus();
				setFocusPath(focusRequest);
			}
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
	const focusNeighbor = (path: string, direction: -1 | 1) => {
		const labels = Array.from(
			list.current?.querySelectorAll<HTMLButtonElement>(".tab-label") ?? [],
		);
		const index = labels.findIndex((label) => label.dataset.path === path);
		if (index < 0 || labels.length < 2) return;
		labels[(index + direction + labels.length) % labels.length]?.focus();
	};
	return (
		// The whole bar takes the drop, not just the tabs: the blank space after the
		// last tab and the padding around the tabs are where a tab is easiest to miss.
		// biome-ignore lint/a11y/noStaticElementInteractions: dragging is a pointer path; the keyboard route is Alt+Shift+Arrow on the tab button
		<div
			ref={bar}
			className="tab-bar"
			data-pane={paneId}
			onDragEnter={(event) => {
				if (!onDropTab || !hasTabDrag(event.dataTransfer)) return;
				event.preventDefault();
			}}
			onDragOver={(event) => {
				if (!onDropTab || !hasTabDrag(event.dataTransfer)) return;
				event.preventDefault();
				setDragEffect(event.dataTransfer, "dropEffect", "move");
				setDropAt(indexAt(event.clientX));
			}}
			onDragLeave={(event) => {
				if (!bar.current?.contains(event.relatedTarget as Node | null))
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
			<div
				ref={list}
				className="tab-list"
				role="tablist"
				aria-label={label}
				data-drop-end={dropAt === tabs.length ? true : undefined}
			>
				{tabs.map((tab, index) => {
					const Icon =
						ICON_BY_NAME.get(tab.icon ?? "") ??
						(tab.canvas ? LayoutDashboard : undefined);
					const node = (
						// biome-ignore lint/a11y/noStaticElementInteractions: dragging is a pointer path; the keyboard route is Alt+Shift+Arrow on the tab button
						<div
							key={tab.path}
							ref={tab.active ? active : undefined}
							role="presentation"
							className="tab"
							data-active={tab.active}
							data-drop={dropAt === index ? "before" : undefined}
							data-carried={carried === tab.path ? true : undefined}
							draggable={draggable && tab.path !== NEW_TAB}
							onDragStart={(event) => {
								if (!draggable || !paneId || tab.path === NEW_TAB) return;
								const drag = { path: tab.path, from: paneId };
								setTabDrag(event.dataTransfer, drag);
								onTabDragStart?.(drag);
								// After the browser has taken the picture it carries.
								setTimeout(() => setCarried(tab.path), 0);
							}}
							onDragEnd={() => {
								setDropAt(null);
								setCarried(null);
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
								tabIndex={tab.path === rovingPath ? 0 : -1}
								title={tab.path === NEW_TAB ? undefined : tab.path}
								onClick={() => onSelect(tab.path)}
								onFocus={() => {
									focusedControlPath.current = tab.path;
									setFocusPath(tab.path);
								}}
								onBlur={(event) => {
									if (
										event.relatedTarget &&
										!list.current?.contains(event.relatedTarget as Node)
									) {
										focusedControlPath.current = null;
									}
								}}
								onKeyDown={(event) => {
									if (event.key !== "ArrowLeft" && event.key !== "ArrowRight")
										return;
									const direction = event.key === "ArrowLeft" ? -1 : 1;
									if (event.altKey && event.shiftKey) {
										if (!onNudge) return;
										event.preventDefault();
										onNudge(tab.path, direction);
										return;
									}
									if (
										event.altKey ||
										event.shiftKey ||
										event.ctrlKey ||
										event.metaKey
									)
										return;
									event.preventDefault();
									focusNeighbor(tab.path, direction);
								}}
							>
								{Icon && <Icon className="tab-icon" aria-hidden="true" />}
								{tab.title}
							</button>
							<button
								type="button"
								className="tab-close"
								aria-label={`Close ${tab.title}`}
								onFocus={() => {
									focusedControlPath.current = tab.path;
								}}
								onBlur={(event) => {
									if (
										event.relatedTarget &&
										!list.current?.contains(event.relatedTarget as Node)
									) {
										focusedControlPath.current = null;
									}
								}}
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
			{tabs.length > 0 && (
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							className="tab-new"
							aria-label="Show all tabs"
							title="Show all tabs"
						>
							<ChevronDown aria-hidden="true" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						{tabs.map((tab) => (
							<DropdownMenuItem
								key={tab.path}
								data-active={tab.active}
								onSelect={() => onSelect(tab.path)}
							>
								{tab.canvas && <LayoutDashboard aria-hidden="true" />}
								{tab.title}
							</DropdownMenuItem>
						))}
					</DropdownMenuContent>
				</DropdownMenu>
			)}
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
