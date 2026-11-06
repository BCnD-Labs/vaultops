import {
	ChevronRight,
	FileText,
	Folder,
	FolderPlus,
	LayoutDashboard,
	Pencil,
	Trash2,
} from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	ancestorsOf,
	countNotes,
	type FolderNode,
	type TreeNode,
} from "../core/notes/tree";
import { useAppearance } from "./AppearanceContext";
import { ICONS, type ItemStyle, modeOf } from "./appearance";
import { StylePopover } from "./StylePopover";

/** What is being dragged: a note or a folder. */
export interface DragItem {
	kind: "note" | "folder";
	path: string;
	readOnly: boolean;
}

/** What the tree can ask the app to do. The app saves, applies and reloads. */
export interface TreeActions {
	createFolder: (parent: string, name: string) => void;
	renameFolder: (path: string, name: string) => void;
	deleteFolder: (path: string) => void;
	/** Move one note or canvas to the trash (it can be restored from there). */
	deleteNote: (path: string) => void;
	move: (item: DragItem, into: string) => void;
}

interface Props {
	newFolderRequest?: number;
	nodes: TreeNode[];
	/** The note that is open, if any; its folders are shown open. */
	livePath: string | null;
	onOpen: (path: string) => void;
	actions: TreeActions;
	/** True while a change is being applied: actions and drops are ignored. */
	busy: boolean;
	foldersOnly?: boolean;
	selectedFolder?: string;
	onSelectFolder?: (path: string) => void;
	/** Clicking a folder name also opens or closes it (plain tree layout). */
	toggleOnSelect?: boolean;
	/** Show every folder open, for a filtered tree whose matches must be visible. */
	expandAll?: boolean;
	header?: (create: () => void) => ReactNode;
	children?: ReactNode;
}

type Editing =
	| { mode: "create"; parent: string }
	| { mode: "rename"; path: string }
	| null;

export const DRAG_TYPE = "application/x-vaultops-item";

function readDrag(event: React.DragEvent): DragItem | null {
	try {
		const raw = JSON.parse(event.dataTransfer.getData(DRAG_TYPE)) as DragItem;
		const kind = raw.kind === "note" || raw.kind === "folder" ? raw.kind : null;
		return kind && typeof raw.path === "string"
			? { kind, path: raw.path, readOnly: raw.readOnly === true }
			: null;
	} catch {
		return null;
	}
}

/** Folders and notes of the vault: open notes, and manage folders. */
export function NoteTree({
	newFolderRequest = 0,
	nodes,
	livePath,
	onOpen,
	actions,
	busy,
	foldersOnly = false,
	selectedFolder,
	onSelectFolder,
	toggleOnSelect = false,
	expandAll = false,
	header,
	children,
}: Props) {
	const [open, setOpen] = useState<Set<string>>(
		() => new Set(livePath ? ancestorsOf(livePath) : []),
	);
	const [editing, setEditing] = useState<Editing>(null);
	const [confirming, setConfirming] = useState<string | null>(null);
	const [over, setOver] = useState<string | null>(null);
	const { appearance, setItem } = useAppearance();
	const lastFolderRequest = useRef(newFolderRequest);
	useEffect(() => {
		if (newFolderRequest !== lastFolderRequest.current) {
			lastFolderRequest.current = newFolderRequest;
			if (!busy) {
				setConfirming(null);
				setEditing({ mode: "create", parent: "" });
			}
		}
	}, [newFolderRequest, busy]);

	// Opening a note (or creating one) shows where it lives.
	useEffect(() => {
		if (livePath === null) return;
		setOpen((now) => {
			const next = new Set(now);
			for (const folder of ancestorsOf(livePath)) next.add(folder);
			return next.size === now.size ? now : next;
		});
	}, [livePath]);

	const toggle = (path: string) =>
		setOpen((now) => {
			const next = new Set(now);
			if (!next.delete(path)) next.add(path);
			return next;
		});

	const startCreate = (parent: string) => {
		if (parent !== "") setOpen((now) => new Set(now).add(parent));
		setConfirming(null);
		setEditing({ mode: "create", parent });
	};

	const drop = (event: React.DragEvent, into: string) => {
		event.preventDefault();
		event.stopPropagation();
		setOver(null);
		const item = readDrag(event);
		if (item && !busy) actions.move(item, into);
	};
	const dragOver = (event: React.DragEvent, into: string) => {
		if (!event.dataTransfer.types.includes(DRAG_TYPE)) return;
		event.preventDefault();
		event.stopPropagation();
		event.dataTransfer.dropEffect = "move";
		setOver(into);
	};

	const ctx: Ctx = {
		styles: appearance.items,
		setStyle: setItem,
		open,
		foldersOnly,
		selectedFolder,
		onSelectFolder,
		toggleOnSelect,
		expandAll,
		livePath,
		busy,
		editing,
		confirming,
		over,
		onToggle: toggle,
		onOpen,
		onEdit: (next) => {
			setConfirming(null);
			setEditing(next);
		},
		onConfirm: (path) => {
			setEditing(null);
			setConfirming(path);
		},
		startCreate,
		actions,
		drop,
		dragOver,
		leave: () => setOver(null),
	};

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: the empty space is a drop target for moving things to the vault root; moving is also possible by dropping on a folder.
		<div
			className={`tree${over === "" ? " is-over" : ""}`}
			onDragOver={(e) => dragOver(e, "")}
			onDragLeave={() => setOver(null)}
			onDrop={(e) => drop(e, "")}
		>
			{header ? (
				header(() => startCreate(""))
			) : (
				<div className="tree-toolbar">
					<button
						type="button"
						className="tree-action tree-new"
						disabled={busy}
						onClick={() => startCreate("")}
					>
						<FolderPlus className="tree-icon" aria-hidden="true" />
						New folder
					</button>
				</div>
			)}
			<ScrollArea className="navigation-scroll">
				<Branch nodes={nodes} parent="" ctx={ctx} />
				{children}
			</ScrollArea>
		</div>
	);
}

/** The data attributes the stylesheet reads to paint a row. */
function toneProps(style: ItemStyle | undefined) {
	return {
		"data-tone": style?.tone,
		"data-mode": style?.tone ? modeOf(style) : undefined,
	};
}

interface Ctx {
	styles: Record<string, ItemStyle>;
	setStyle: (path: string, style: ItemStyle | null) => void;
	foldersOnly: boolean;
	selectedFolder?: string;
	onSelectFolder?: (path: string) => void;
	toggleOnSelect: boolean;
	expandAll: boolean;
	open: Set<string>;
	livePath: string | null;
	busy: boolean;
	editing: Editing;
	confirming: string | null;
	over: string | null;
	onToggle: (path: string) => void;
	onOpen: (path: string) => void;
	onEdit: (next: Editing) => void;
	onConfirm: (path: string | null) => void;
	startCreate: (parent: string) => void;
	actions: TreeActions;
	drop: (event: React.DragEvent, into: string) => void;
	dragOver: (event: React.DragEvent, into: string) => void;
	leave: () => void;
}

function NameInput(props: {
	initial: string;
	label: string;
	allowEmpty: boolean;
	onSubmit: (name: string) => void;
	onCancel: () => void;
}) {
	const ref = useRef<HTMLInputElement>(null);
	const done = useRef(false);
	useEffect(() => {
		ref.current?.focus();
		ref.current?.select();
	}, []);
	// Enter or leaving the field keeps the name; Escape drops it. An empty name
	// only counts when it is allowed (a new folder falls back to "New folder").
	const finish = (keep: boolean, emptyOk: boolean) => {
		if (done.current) return;
		done.current = true;
		const value = ref.current?.value ?? "";
		if (keep && (value.trim() !== "" || emptyOk)) props.onSubmit(value);
		else props.onCancel();
	};
	return (
		<input
			ref={ref}
			className="tree-input"
			aria-label={props.label}
			defaultValue={props.initial}
			onKeyDown={(e) => {
				if (e.key === "Enter") finish(true, props.allowEmpty);
				else if (e.key === "Escape") finish(false, false);
			}}
			onBlur={() => finish(true, false)}
		/>
	);
}

function Branch({
	nodes,
	parent,
	ctx,
}: {
	nodes: TreeNode[];
	parent: string;
	ctx: Ctx;
}) {
	const visible = ctx.foldersOnly
		? nodes.filter((node) => node.kind === "folder")
		: nodes;
	const creating =
		ctx.editing?.mode === "create" && ctx.editing.parent === parent;
	return (
		<ul className="note-list">
			{creating && (
				<li>
					<NameInput
						initial=""
						label="New folder name"
						allowEmpty
						onSubmit={(name) => {
							ctx.onEdit(null);
							ctx.actions.createFolder(parent, name);
						}}
						onCancel={() => ctx.onEdit(null)}
					/>
				</li>
			)}
			{visible.map((node) =>
				node.kind === "note" ? (
					<li key={node.path} title={node.path}>
						{ctx.confirming === node.path ? (
							<div className="tree-confirm" role="alert">
								<p>
									Move <strong>{node.name}</strong> to the trash? You can
									restore it from the trash.
								</p>
								<div className="tree-confirm-buttons">
									<Button
										size="sm"
										variant="destructive"
										onClick={() => {
											ctx.onConfirm(null);
											ctx.actions.deleteNote(node.path);
										}}
									>
										Move to trash
									</Button>
									<Button
										size="sm"
										variant="secondary"
										onClick={() => ctx.onConfirm(null)}
									>
										Cancel
									</Button>
								</div>
							</div>
						) : (
							<div className="tree-row" {...toneProps(ctx.styles[node.path])}>
								<button
									type="button"
									className="tree-note"
									draggable={!ctx.busy}
									aria-current={node.path === ctx.livePath}
									onClick={() => ctx.onOpen(node.path)}
									onDragStart={(e) => {
										const item: DragItem = {
											kind: "note",
											path: node.path,
											readOnly: node.readOnly,
										};
										e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(item));
										e.dataTransfer.effectAllowed = "move";
									}}
								>
									<span className="tree-icon" aria-hidden="true" />
									{(() => {
										const Icon =
											ICONS[ctx.styles[node.path]?.icon ?? ""] ??
											(node.canvas ? LayoutDashboard : FileText);
										return (
											<Icon
												className="tree-icon tree-icon-main"
												aria-hidden="true"
											/>
										);
									})()}
									<span className="tree-name">{node.name}</span>
									{node.readOnly && (
										<span className="read-only-tag">read-only</span>
									)}
								</button>
								<span className="tree-actions">
									<StylePopover
										name={node.name}
										style={ctx.styles[node.path]}
										onChange={(next) => ctx.setStyle(node.path, next)}
									/>
									<button
										type="button"
										className="tree-action"
										aria-label={`Move ${node.canvas ? "canvas" : "note"} ${node.name} to the trash`}
										title="Move to trash"
										disabled={ctx.busy}
										onClick={() => ctx.onConfirm(node.path)}
									>
										<Trash2 className="tree-icon" aria-hidden="true" />
									</button>
								</span>
							</div>
						)}
					</li>
				) : (
					<FolderRow key={`folder:${node.path}`} node={node} ctx={ctx} />
				),
			)}
		</ul>
	);
}

function FolderRow({ node, ctx }: { node: FolderNode; ctx: Ctx }) {
	const isOpen = ctx.expandAll || ctx.open.has(node.path);
	const renaming =
		ctx.editing?.mode === "rename" && ctx.editing.path === node.path;
	const notes = countNotes(node);

	let row: React.ReactNode;
	if (renaming) {
		row = (
			<NameInput
				initial={node.name}
				label={`Rename folder ${node.name}`}
				allowEmpty={false}
				onSubmit={(name) => {
					ctx.onEdit(null);
					if (name !== node.name) ctx.actions.renameFolder(node.path, name);
				}}
				onCancel={() => ctx.onEdit(null)}
			/>
		);
	} else if (ctx.confirming === node.path) {
		row = (
			<div className="tree-confirm" role="alert">
				<p>
					Move <strong>{node.name}</strong> to the trash
					{notes > 0
						? ` with its ${notes} ${notes === 1 ? "note" : "notes"}`
						: ""}
					? You can restore notes from the trash.
				</p>
				<div className="tree-confirm-buttons">
					<Button
						size="sm"
						variant="destructive"
						onClick={() => {
							ctx.onConfirm(null);
							ctx.actions.deleteFolder(node.path);
						}}
					>
						Move to trash
					</Button>
					<Button
						size="sm"
						variant="secondary"
						onClick={() => ctx.onConfirm(null)}
					>
						Cancel
					</Button>
				</div>
			</div>
		);
	} else {
		row = (
			// biome-ignore lint/a11y/noStaticElementInteractions: a folder row is a drop target for moving notes and folders into it.
			<div
				className={`tree-row${ctx.over === node.path ? " is-over" : ""}`}
				{...toneProps(ctx.styles[node.path])}
				onDragOver={(e) => ctx.dragOver(e, node.path)}
				onDragLeave={(e) => {
					if (!e.currentTarget.contains(e.relatedTarget as Node | null))
						ctx.leave();
				}}
				onDrop={(e) => ctx.drop(e, node.path)}
			>
				{ctx.onSelectFolder && (
					<button
						type="button"
						className="tree-action"
						aria-label={`Toggle folder ${node.name}`}
						aria-expanded={isOpen}
						onClick={() => ctx.onToggle(node.path)}
					>
						<ChevronRight
							className={`tree-icon tree-chevron${isOpen ? " is-open" : ""}`}
						/>
					</button>
				)}
				<button
					type="button"
					className="tree-folder"
					aria-expanded={isOpen}
					draggable={!ctx.busy}
					aria-current={node.path === ctx.selectedFolder}
					onClick={() => {
						if (!ctx.onSelectFolder) ctx.onToggle(node.path);
						else {
							ctx.onSelectFolder(node.path);
							if (ctx.toggleOnSelect) ctx.onToggle(node.path);
						}
					}}
					onDragStart={(e) => {
						const item: DragItem = {
							kind: "folder",
							path: node.path,
							readOnly: false,
						};
						e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(item));
						e.dataTransfer.effectAllowed = "move";
					}}
				>
					{!ctx.onSelectFolder && (
						<ChevronRight
							className={`tree-icon tree-chevron${isOpen ? " is-open" : ""}`}
							aria-hidden="true"
						/>
					)}
					{(() => {
						const Icon = ICONS[ctx.styles[node.path]?.icon ?? ""] ?? Folder;
						return (
							<Icon className="tree-icon tree-icon-main" aria-hidden="true" />
						);
					})()}
					<span className="tree-name">{node.name}</span>
					{notes > 0 && <span className="sidebar-count">{notes}</span>}
				</button>
				<span className="tree-actions">
					<StylePopover
						name={node.name}
						style={ctx.styles[node.path]}
						onChange={(next) => ctx.setStyle(node.path, next)}
					/>
					<button
						type="button"
						className="tree-action"
						aria-label={`New folder in ${node.name}`}
						title="New folder here"
						disabled={ctx.busy}
						onClick={() => ctx.startCreate(node.path)}
					>
						<FolderPlus className="tree-icon" aria-hidden="true" />
					</button>
					<button
						type="button"
						className="tree-action"
						aria-label={`Rename folder ${node.name}`}
						title="Rename"
						disabled={ctx.busy}
						onClick={() => ctx.onEdit({ mode: "rename", path: node.path })}
					>
						<Pencil className="tree-icon" aria-hidden="true" />
					</button>
					<button
						type="button"
						className="tree-action"
						aria-label={`Move folder ${node.name} to the trash`}
						title="Move to trash"
						disabled={ctx.busy}
						onClick={() => ctx.onConfirm(node.path)}
					>
						<Trash2 className="tree-icon" aria-hidden="true" />
					</button>
				</span>
			</div>
		);
	}

	const creatingHere =
		ctx.editing?.mode === "create" && ctx.editing.parent === node.path;
	return (
		<li title={node.path}>
			{row}
			{isOpen &&
				(node.children.length > 0 || creatingHere ? (
					<Branch nodes={node.children} parent={node.path} ctx={ctx} />
				) : (
					<p className="read-only-tag tree-empty">Empty</p>
				))}
		</li>
	);
}
