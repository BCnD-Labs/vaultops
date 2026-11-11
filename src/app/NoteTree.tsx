import {
	ChevronRight,
	Copy,
	FilePlus,
	FileText,
	Folder,
	FolderInput,
	FolderPlus,
	LayoutDashboard,
	Palette,
	Pencil,
	Trash2,
} from "lucide-react";
import {
	type CSSProperties,
	type ReactNode,
	useEffect,
	useId,
	useRef,
	useState,
} from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { folderNameProblem } from "../core/notes/folders";
import {
	ancestorsOf,
	countNotes,
	type FolderNode,
	type NoteNode,
	type TreeNode,
} from "../core/notes/tree";
import { useAppearance } from "./AppearanceContext";
import { type ItemStyle, rowPaint } from "./appearance";
import { resolveIcon } from "./iconCatalog";
import { StylePopover } from "./StylePopover";
import { type TreeMenuEntry, TreeRowMenu } from "./TreeRowMenu";

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
	/** Rename a note or canvas (its title and file name). Menu entry hidden when absent. */
	renameNote?: (path: string, title: string) => void;
	/** Copy a note or canvas into a new file beside it. */
	duplicateNote?: (path: string) => void;
	/** Ask where to move a note, canvas or folder. */
	moveTo?: (item: DragItem) => void;
	newNote?: (folder: string) => void;
	newCanvas?: (folder: string) => void;
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
	| { mode: "renameNote"; path: string }
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
	// The row whose icon and colour editor is open (from its menu).
	const [styling, setStyling] = useState<string | null>(null);
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
		styling,
		onStyle: setStyling,
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
		foldersIn: (parent) => foldersIn(nodes, parent),
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

/** Names of the folders directly inside `parent` ("" is the root) among `nodes`. */
function foldersIn(nodes: TreeNode[], parent: string): string[] {
	const level =
		parent === ""
			? nodes
			: (() => {
					const find = (list: TreeNode[]): TreeNode[] | null => {
						for (const n of list) {
							if (n.kind !== "folder") continue;
							if (n.path === parent) return n.children;
							const inner = find(n.children);
							if (inner) return inner;
						}
						return null;
					};
					return find(nodes) ?? [];
				})();
	return level.filter((n) => n.kind === "folder").map((n) => n.name);
}

/** The inline variables and data attributes the stylesheet reads to paint a row. */
function toneProps(style: ItemStyle | undefined) {
	const paint = rowPaint(style);
	return { style: paint.style as CSSProperties, ...paint.attrs };
}

interface Ctx {
	styles: Record<string, ItemStyle>;
	setStyle: (path: string, style: ItemStyle | null) => void;
	styling: string | null;
	onStyle: (path: string | null) => void;
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
	/** Names of the folders directly inside `parent` that the tree knows about. */
	foldersIn: (parent: string) => string[];
}

function NameInput(props: {
	initial: string;
	label: string;
	allowEmpty: boolean;
	/** Other folders in the same place; a name that matches one is refused inline. */
	taken: string[];
	/** Why a name can't be used, or null. Defaults to the folder-name rules. */
	check?: (value: string, taken: string[]) => string | null;
	onSubmit: (name: string) => void;
	onCancel: () => void;
}) {
	const check = props.check ?? folderNameProblem;
	const ref = useRef<HTMLInputElement>(null);
	const done = useRef(false);
	const errorId = useId();
	const [problem, setProblem] = useState<string | null>(null);
	useEffect(() => {
		ref.current?.focus();
		ref.current?.select();
	}, []);
	// Enter or leaving the field keeps the name; Escape drops it. An empty name
	// only counts when it is allowed (a new folder falls back to "New folder").
	const finish = (keep: boolean, emptyOk: boolean) => {
		if (done.current) return;
		const value = ref.current?.value ?? "";
		// A taken name stays in the field with the reason shown; nothing is made.
		const clash = keep ? check(value, props.taken) : null;
		if (clash) {
			setProblem(clash);
			return;
		}
		done.current = true;
		if (keep && (value.trim() !== "" || emptyOk)) props.onSubmit(value);
		else props.onCancel();
	};
	return (
		<>
			<input
				ref={ref}
				className="tree-input"
				aria-label={props.label}
				aria-invalid={problem !== null}
				aria-describedby={problem ? errorId : undefined}
				defaultValue={props.initial}
				onChange={(e) => setProblem(check(e.target.value, props.taken))}
				onKeyDown={(e) => {
					if (e.key === "Enter") finish(true, props.allowEmpty);
					else if (e.key === "Escape") finish(false, false);
				}}
				onBlur={() => finish(true, false)}
			/>
			{problem && (
				<p id={errorId} role="alert" className="tree-input-error">
					{problem}
				</p>
			)}
		</>
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
						taken={ctx.foldersIn(parent)}
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
					<NoteRow key={node.path} node={node} ctx={ctx} />
				) : (
					<FolderRow key={`folder:${node.path}`} node={node} ctx={ctx} />
				),
			)}
		</ul>
	);
}

function styleEntry(path: string, ctx: Ctx): TreeMenuEntry {
	return {
		label: "Icon and colour…",
		icon: Palette,
		editor: true,
		run: () => ctx.onStyle(path),
	};
}

/** The actions a note or canvas row offers, in menu order. */
function noteEntries(node: NoteNode, ctx: Ctx): TreeMenuEntry[] {
	const a = ctx.actions;
	const open: TreeMenuEntry = {
		label: "Open",
		icon: node.canvas ? LayoutDashboard : FileText,
		run: () => ctx.onOpen(node.path),
	};
	const trash: TreeMenuEntry = {
		label: "Move to trash",
		icon: Trash2,
		danger: true,
		run: () => a.deleteNote(node.path),
	};
	// A read-only file (damaged, newer or duplicated) is never rewritten.
	if (node.readOnly) return [open, "separator", trash];
	const item: DragItem = { kind: "note", path: node.path, readOnly: false };
	const entries: TreeMenuEntry[] = [open];
	if (a.renameNote)
		entries.push({
			label: "Rename",
			icon: Pencil,
			editor: true,
			run: () => ctx.onEdit({ mode: "renameNote", path: node.path }),
		});
	if (a.duplicateNote) {
		const duplicate = a.duplicateNote;
		entries.push({
			label: "Duplicate",
			icon: Copy,
			run: () => duplicate(node.path),
		});
	}
	if (a.moveTo) {
		const moveTo = a.moveTo;
		entries.push({
			label: "Move to…",
			icon: FolderInput,
			run: () => moveTo(item),
		});
	}
	entries.push("separator", styleEntry(node.path, ctx), "separator", trash);
	return entries;
}

function NoteRow({ node, ctx }: { node: NoteNode; ctx: Ctx }) {
	const what = node.canvas ? "canvas" : "note";
	if (ctx.editing?.mode === "renameNote" && ctx.editing.path === node.path) {
		return (
			<li title={node.path}>
				<NameInput
					initial={node.name}
					label={`Rename ${what} ${node.name}`}
					allowEmpty={false}
					taken={[]}
					// A note name never clashes: the file takes the next free name.
					check={() => null}
					onSubmit={(name) => {
						ctx.onEdit(null);
						const title = name.trim();
						if (title !== node.name) ctx.actions.renameNote?.(node.path, title);
					}}
					onCancel={() => ctx.onEdit(null)}
				/>
			</li>
		);
	}
	const entries = noteEntries(node, ctx);
	return (
		<li title={node.path}>
			<StylePopover
				defaultIcon={node.canvas ? LayoutDashboard : FileText}
				name={node.name}
				style={ctx.styles[node.path]}
				onChange={(next) => ctx.setStyle(node.path, next)}
				open={ctx.styling === node.path}
				onOpenChange={(open) => {
					if (!open) ctx.onStyle(null);
				}}
			>
				<TreeRowMenu entries={entries} disabled={ctx.busy}>
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
									resolveIcon(ctx.styles[node.path]?.icon ?? "") ??
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
					</div>
				</TreeRowMenu>
			</StylePopover>
		</li>
	);
}

/** The actions a folder row offers, in menu order. */
function folderEntries(node: FolderNode, ctx: Ctx): TreeMenuEntry[] {
	const a = ctx.actions;
	const entries: TreeMenuEntry[] = [];
	if (a.newNote) {
		const newNote = a.newNote;
		entries.push({
			label: "New note here",
			icon: FilePlus,
			run: () => newNote(node.path),
		});
	}
	if (a.newCanvas) {
		const newCanvas = a.newCanvas;
		entries.push({
			label: "New canvas here",
			icon: LayoutDashboard,
			run: () => newCanvas(node.path),
		});
	}
	entries.push(
		{
			label: "New folder here",
			icon: FolderPlus,
			editor: true,
			run: () => ctx.startCreate(node.path),
		},
		"separator",
		{
			label: "Rename",
			icon: Pencil,
			editor: true,
			run: () => ctx.onEdit({ mode: "rename", path: node.path }),
		},
	);
	if (a.moveTo) {
		const moveTo = a.moveTo;
		entries.push({
			label: "Move to…",
			icon: FolderInput,
			run: () => moveTo({ kind: "folder", path: node.path, readOnly: false }),
		});
	}
	entries.push("separator", styleEntry(node.path, ctx), "separator", {
		label: "Move to trash",
		icon: Trash2,
		danger: true,
		run: () => ctx.onConfirm(node.path),
	});
	return entries;
}

function FolderRow({ node, ctx }: { node: FolderNode; ctx: Ctx }) {
	const isOpen = ctx.expandAll || ctx.open.has(node.path);
	const renaming =
		ctx.editing?.mode === "rename" && ctx.editing.path === node.path;
	const notes = countNotes(node);
	const entries = folderEntries(node, ctx);

	let row: React.ReactNode;
	if (renaming) {
		row = (
			<NameInput
				initial={node.name}
				label={`Rename folder ${node.name}`}
				allowEmpty={false}
				taken={ctx
					.foldersIn(
						node.path.includes("/")
							? node.path.slice(0, node.path.lastIndexOf("/"))
							: "",
					)
					.filter((n) => n !== node.name)}
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
						const Icon =
							resolveIcon(ctx.styles[node.path]?.icon ?? "") ?? Folder;
						return (
							<Icon className="tree-icon tree-icon-main" aria-hidden="true" />
						);
					})()}
					<span className="tree-name">{node.name}</span>
					{notes > 0 && <span className="sidebar-count">{notes}</span>}
				</button>
			</div>
		);
		row = (
			<StylePopover
				name={node.name}
				style={ctx.styles[node.path]}
				onChange={(next) => ctx.setStyle(node.path, next)}
				open={ctx.styling === node.path}
				onOpenChange={(open) => {
					if (!open) ctx.onStyle(null);
				}}
			>
				<TreeRowMenu entries={entries} disabled={ctx.busy}>
					{row as React.ReactElement}
				</TreeRowMenu>
			</StylePopover>
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
