import {
	ArrowDownUp,
	ChevronDown,
	Columns2,
	FilePlus,
	Files,
	FolderPlus,
	HeartPulse,
	Rows2,
	Search,
	Trash2,
} from "lucide-react";
import { type ReactNode, useContext, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
} from "@/components/ui/resizable";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { matchesNote, sortNotes } from "../core/notes/list";
import type { TreeNode } from "../core/notes/tree";
import { ShellNavigation } from "./AppShell";
import { healthCount, healthLabel } from "./HealthScreen";
import { NoteListRow } from "./NoteListRow";
import { NoteTree, type TreeActions } from "./NoteTree";
import { noteSort } from "./note-sort";
import type { VaultView } from "./session";
import {
	type Selection,
	selectedNotes,
	sidebarPreferences,
} from "./sidebar-selection";
import { TagIndex } from "./TagBrowser";
import "./sidebar.css";

interface SidebarProps {
	view: VaultView | null;
	busy: boolean;
	maintainer: boolean;
	selection: Selection;
	livePath: string | null;
	tree: TreeNode[];
	treeActions: TreeActions;
	treeNotice: string | null;
	onStartNote: (folder: string) => void;
	onChooseVault: () => void;
	onShowMaintainer: () => void;
	onNavigate: (screen: "trash" | "health") => void;
	onSelection: (selection: Selection) => void;
	onOpen: (path: string) => void;
}

function IconAction({
	label,
	children,
	onClick,
	disabled,
}: {
	label: string;
	children: ReactNode;
	onClick: () => void;
	disabled?: boolean;
}) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					aria-label={label}
					onClick={onClick}
					disabled={disabled}
				>
					{children}
				</Button>
			</TooltipTrigger>
			<TooltipContent>{label}</TooltipContent>
		</Tooltip>
	);
}

export function Sidebar({
	view,
	busy,
	maintainer,
	selection,
	livePath,
	tree,
	treeActions,
	treeNotice,
	onStartNote,
	onChooseVault,
	onShowMaintainer,
	onNavigate,
	onSelection,
	onOpen,
}: SidebarProps) {
	const { tags } = useContext(ShellNavigation);
	const tagsSection = useRef<HTMLDetailsElement>(null);
	useEffect(() => {
		if (!tags || !tagsSection.current) return;
		tagsSection.current.open = true;
		tagsSection.current.scrollIntoView({ block: "nearest" });
		tagsSection.current.querySelector("summary")?.focus();
	}, [tags]);
	const [preferences, setPreferences] = useState(() => sidebarPreferences());
	const sizesRef = useRef(preferences.sizes);
	const locked = busy || !view?.writable;
	const [query, setQuery] = useState("");
	const [sort, setSort] = useState(() => noteSort());
	const notes = sortNotes(
		selectedNotes(view?.notes ?? [], selection).filter((note) =>
			matchesNote(note, query),
		),
		sort,
	);
	const label =
		selection.kind === "all"
			? "All notes"
			: selection.kind === "tag"
				? `#${selection.value}`
				: selection.value.split("/").pop() || view?.name || "Vault";
	return (
		<aside className="sidebar" aria-label="Vault navigation">
			<ResizablePanelGroup
				key={preferences.orientation}
				orientation={preferences.orientation}
				defaultLayout={preferences.sizes}
				onLayoutChanged={(sizes) => {
					sizesRef.current = sizes;
					sidebarPreferences({ orientation: preferences.orientation, sizes });
				}}
			>
				<ResizablePanel id="navigation" minSize="10%">
					<section className="sidebar-pane" aria-label="Navigation">
						<NoteTree
							nodes={tree}
							livePath={livePath}
							onOpen={onOpen}
							actions={treeActions}
							busy={locked}
							foldersOnly
							selectedFolder={
								selection.kind === "folder" ? selection.value : undefined
							}
							onSelectFolder={(value) => onSelection({ kind: "folder", value })}
							header={(create) => (
								<>
									<header className="sidebar-header">
										<DropdownMenu>
											<DropdownMenuTrigger asChild>
												<button
													type="button"
													className="vault-switch"
													disabled={busy}
												>
													{view?.name ?? "VaultOps"}
													<ChevronDown className="tree-icon" />
												</button>
											</DropdownMenuTrigger>
											<DropdownMenuContent>
												<DropdownMenuItem onSelect={onChooseVault}>
													Choose vault…
												</DropdownMenuItem>
												{maintainer && (
													<DropdownMenuItem onSelect={onShowMaintainer}>
														Developer
													</DropdownMenuItem>
												)}
											</DropdownMenuContent>
										</DropdownMenu>
										<IconAction
											label="New folder"
											disabled={locked}
											onClick={create}
										>
											<FolderPlus />
										</IconAction>
										<IconAction
											label={
												preferences.orientation === "vertical"
													? "Side by side"
													: "Stacked"
											}
											onClick={() =>
												setPreferences(
													sidebarPreferences({
														orientation:
															preferences.orientation === "vertical"
																? "horizontal"
																: "vertical",
														sizes: sizesRef.current,
													}),
												)
											}
										>
											{preferences.orientation === "vertical" ? (
												<Columns2 />
											) : (
												<Rows2 />
											)}
										</IconAction>
									</header>
									<div className="section-label">Notes</div>
									<button
										type="button"
										className="sidebar-row"
										aria-current={selection.kind === "all"}
										onClick={() => onSelection({ kind: "all" })}
									>
										<Files className="tree-icon" />
										All notes
										<span className="sidebar-count">
											{view?.notes.length || ""}
										</span>
									</button>
								</>
							)}
						>
							<details ref={tagsSection} open>
								<summary className="section-label">Tags</summary>
								<TagIndex
									rows={view?.notes ?? []}
									active={selection.kind === "tag" ? selection.value : null}
									onPick={(value) => onSelection({ kind: "tag", value })}
								/>
							</details>
						</NoteTree>
						{view && view.status !== "none" && (
							<footer>
								<button
									type="button"
									className="sidebar-row"
									disabled={busy}
									onClick={() => onNavigate("trash")}
								>
									<Trash2 className="tree-icon" />
									Trash
								</button>
								<button
									type="button"
									className="sidebar-row"
									disabled={busy}
									aria-label={healthLabel(view.report)}
									onClick={() => onNavigate("health")}
								>
									<HeartPulse className="tree-icon" />
									Health
									<span className="sidebar-count">
										{healthCount(view.report) || ""}
									</span>
								</button>
							</footer>
						)}
					</section>
				</ResizablePanel>
				<ResizableHandle />
				<ResizablePanel id="notes" minSize="10%">
					<section className="sidebar-pane" aria-label="Notes list">
						<header className="sidebar-header">
							<strong className="tree-name">{label}</strong>
							<DropdownMenu>
								<Tooltip>
									<TooltipTrigger asChild>
										<DropdownMenuTrigger asChild>
											<Button
												variant="ghost"
												size="icon"
												aria-label="Sort notes"
											>
												<ArrowDownUp />
											</Button>
										</DropdownMenuTrigger>
									</TooltipTrigger>
									<TooltipContent>Sort notes</TooltipContent>
								</Tooltip>
								<DropdownMenuContent>
									<DropdownMenuRadioGroup
										value={sort}
										onValueChange={(value) =>
											setSort(
												noteSort(
													value === "name-desc" ? "name-desc" : "name-asc",
												),
											)
										}
									>
										<DropdownMenuRadioItem value="name-asc">
											Name (A to Z)
										</DropdownMenuRadioItem>
										<DropdownMenuRadioItem value="name-desc">
											Name (Z to A)
										</DropdownMenuRadioItem>
									</DropdownMenuRadioGroup>
								</DropdownMenuContent>
							</DropdownMenu>
							<IconAction
								label="New note"
								disabled={locked}
								onClick={() =>
									onStartNote(
										selection.kind === "folder" ? selection.value : "",
									)
								}
							>
								<FilePlus />
							</IconAction>
						</header>
						<label className="note-search">
							<Search className="tree-icon" aria-hidden="true" />
							<input
								aria-label="Search notes"
								placeholder="Search notes"
								value={query}
								onChange={(event) => setQuery(event.target.value)}
								onKeyDown={(event) => {
									if (event.key === "Escape") {
										event.preventDefault();
										setQuery("");
									}
								}}
							/>
						</label>
						<ScrollArea className="navigation-scroll">
							<ul className="note-list note-rows">
								{notes.map((note) => (
									<NoteListRow
										key={note.path}
										note={note}
										current={note.path === livePath}
										locked={locked}
										onOpen={onOpen}
									/>
								))}
							</ul>
							{notes.length === 0 && (
								<p className="read-only-tag">
									{query ? "No notes match." : "No notes here yet."}
								</p>
							)}
						</ScrollArea>
					</section>
				</ResizablePanel>
			</ResizablePanelGroup>
			{view?.messages.map((message) => (
				<p key={message} className="notice">
					{message}
				</p>
			))}
			{treeNotice && (
				<p role="status" className="notice">
					{treeNotice}
				</p>
			)}
		</aside>
	);
}
