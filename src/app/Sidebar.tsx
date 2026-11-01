import { Button } from "@/components/ui/button";
import type { TreeNode } from "../core/notes/tree";
import { healthLabel } from "./HealthScreen";
import { NoteTree, type TreeActions } from "./NoteTree";
import type { VaultView } from "./session";
import { TaggedNotes, TagIndex } from "./TagBrowser";
import "./sidebar.css";

interface SidebarProps {
	view: VaultView | null;
	busy: boolean;
	maintainer: boolean;
	tagFilter: string | null;
	livePath: string | null;
	tree: TreeNode[];
	treeActions: TreeActions;
	treeNotice: string | null;
	onStartNote: () => void;
	onChooseVault: () => void;
	onShowMaintainer: () => void;
	onNavigate: (screen: "trash" | "health") => void;
	onTagFilter: (tag: string | null) => void;
	onOpen: (path: string) => void;
}

export function Sidebar({
	view,
	busy,
	maintainer,
	tagFilter,
	livePath,
	tree,
	treeActions,
	treeNotice,
	onStartNote,
	onChooseVault,
	onShowMaintainer,
	onNavigate,
	onTagFilter,
	onOpen,
}: SidebarProps) {
	return (
		<aside className="sidebar">
			<h1>{view?.name ?? "VaultOps"}</h1>
			<div className="sidebar-actions">
				<Button
					size="sm"
					disabled={busy || !view?.writable}
					onClick={onStartNote}
				>
					New note
				</Button>
				<Button
					size="sm"
					variant="secondary"
					disabled={busy}
					onClick={onChooseVault}
				>
					Choose vault…
				</Button>
				{maintainer && (
					<Button size="sm" variant="secondary" onClick={onShowMaintainer}>
						Developer
					</Button>
				)}
			</div>
			{view && view.status !== "none" && (
				<div className="sidebar-actions">
					<Button
						size="sm"
						variant="secondary"
						disabled={busy}
						onClick={() => onNavigate("trash")}
					>
						Trash
					</Button>
					<Button
						size="sm"
						variant="secondary"
						disabled={busy}
						onClick={() => onNavigate("health")}
					>
						{healthLabel(view.report)}
					</Button>
				</div>
			)}
			{view?.messages.map((m) => (
				<p key={m} className="notice">
					{m}
				</p>
			))}
			{view && view.status !== "none" && (
				<TagIndex
					rows={view.notes}
					active={tagFilter}
					onPick={(tag) => onTagFilter(tag)}
				/>
			)}
			{view &&
				view.status !== "none" &&
				(tagFilter !== null ? (
					<TaggedNotes
						rows={view.notes}
						tag={tagFilter}
						livePath={livePath}
						onOpen={onOpen}
						onClear={() => onTagFilter(null)}
					/>
				) : (
					<NoteTree
						nodes={tree}
						livePath={livePath}
						onOpen={onOpen}
						actions={treeActions}
						busy={busy || !view.writable}
					/>
				))}
			{treeNotice && (
				<p role="status" className="notice">
					{treeNotice}
				</p>
			)}
			{view &&
				view.status !== "none" &&
				view.notes.length === 0 &&
				view.folders.length === 0 && (
					<p className="read-only-tag">No notes yet.</p>
				)}
		</aside>
	);
}
