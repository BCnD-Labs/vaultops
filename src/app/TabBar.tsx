import { LayoutDashboard, Plus, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
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
	splitOpen?: boolean;
	onCloseSplit?: () => void;
	/** The tab list's accessible name (a split view has one list per side). */
	label?: string;
	/** Set on a split view's tab strips: which side this strip belongs to. */
	paneId?: "left" | "right";
}) {
	const active = useRef<HTMLDivElement | null>(null);
	const activePath = tabs.find((tab) => tab.active)?.path;
	// biome-ignore lint/correctness/useExhaustiveDependencies: scroll when the active tab changes
	useEffect(() => {
		active.current?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
	}, [activePath]);
	return (
		<div className="tab-bar" data-pane={paneId}>
			<div className="tab-list" role="tablist" aria-label={label}>
				{tabs.map((tab) => {
					const node = (
						<div
							key={tab.path}
							ref={tab.active ? active : undefined}
							role="presentation"
							className="tab"
							data-active={tab.active}
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
								aria-selected={tab.active}
								title={tab.path === NEW_TAB ? undefined : tab.path}
								onClick={() => onSelect(tab.path)}
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
