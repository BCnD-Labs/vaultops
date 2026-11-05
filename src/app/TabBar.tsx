import { Plus, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { NEW_TAB } from "./tabs";

export interface TabItem {
	path: string;
	title: string;
	active: boolean;
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
}: {
	tabs: TabItem[];
	onSelect: (path: string) => void;
	onClose: (path: string) => void;
	onNew: () => void;
}) {
	const active = useRef<HTMLDivElement | null>(null);
	const activePath = tabs.find((tab) => tab.active)?.path;
	// biome-ignore lint/correctness/useExhaustiveDependencies: scroll when the active tab changes
	useEffect(() => {
		active.current?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
	}, [activePath]);
	return (
		<div className="tab-bar">
			<div className="tab-list" role="tablist" aria-label="Open notes">
				{tabs.map((tab) => (
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
				))}
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
