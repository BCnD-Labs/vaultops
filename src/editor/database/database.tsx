import { type Extensions, mergeAttributes, Node } from "@tiptap/core";
import {
	NodeViewContent,
	type NodeViewProps,
	NodeViewWrapper,
	ReactNodeViewRenderer,
} from "@tiptap/react";
import {
	AlignLeft,
	ArrowDown,
	ArrowLeft,
	ArrowRight,
	ArrowUp,
	Calendar,
	CircleChevronDown,
	CircleDot,
	Ellipsis,
	FileText,
	Gauge,
	Hash,
	Link,
	type LucideIcon,
	PanelRightOpen,
	Plus,
	SquareCheck,
	Tags,
	Trash2,
	Type,
	X,
} from "lucide-react";
import {
	type PointerEvent as ReactPointerEvent,
	useCallback,
	useMemo,
	useState,
} from "react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { useLinkSource } from "../note-link";
import { Cell } from "./cells";
import {
	addColumn,
	addRow,
	changeColumnType,
	DATABASE,
	DATABASE_ROW,
	databaseFromNode,
	deleteColumn,
	deleteRow,
	moveColumn,
	setCell,
	setOptionCell,
	setSort,
	setTitle,
	updateColumn,
} from "./commands";
import { TYPE_ICONS } from "./icons";
import {
	type CellValue,
	COLUMN_TYPE_LABELS,
	type ColumnType,
	clampWidth,
	type DbColumn,
	DEFAULT_WIDTH,
	FALLBACK_COLUMNS,
	PICKABLE_TYPES,
	sortedOrder,
	TITLE_ID,
} from "./model";
import { RowPeek } from "./RowPeek";
import { syncRowName } from "./row-note";
import "./database.css";

/** A JSON attribute stored on the element as `data-<name>`. */
function jsonAttr(name: string, fallback: unknown) {
	return {
		default: fallback,
		parseHTML: (element: HTMLElement) => {
			const raw = element.getAttribute(`data-${name}`);
			if (raw === null) return fallback;
			try {
				return JSON.parse(raw);
			} catch {
				return fallback;
			}
		},
		renderHTML: (attributes: Record<string, unknown>) =>
			attributes[name] === fallback
				? {}
				: { [`data-${name}`]: JSON.stringify(attributes[name]) },
	};
}

/**
 * One row of a database. Stored as its own line, so history, diffs and the
 * changed-block dot work per row: `attrs.cells` maps a column id to the row's
 * value, and the row's page (any blocks) follows as its child lines. Rows are
 * never shown as blocks in the note; the database view draws them.
 */
export const DatabaseRow = Node.create({
	name: DATABASE_ROW,
	content: "block*",
	defining: true,
	isolating: true,
	selectable: false,
	draggable: false,

	addAttributes() {
		return {
			cells: jsonAttr("cells", {}),
			// The note this row was turned into; left out when there is none.
			noteId: {
				default: null,
				parseHTML: (element: HTMLElement) =>
					element.getAttribute("data-note-id"),
				renderHTML: (attributes: Record<string, unknown>) =>
					attributes.noteId ? { "data-note-id": attributes.noteId } : {},
			},
		};
	},

	parseHTML() {
		return [{ tag: 'div[data-type="database-row"]' }];
	},

	renderHTML({ HTMLAttributes }) {
		return [
			"div",
			mergeAttributes(HTMLAttributes, { "data-type": "database-row" }),
			0,
		];
	},
});

export interface DatabaseOptions {
	/** The editor setup for a row's page (the panel's own small editor). */
	pageExtensions: () => Extensions;
}

/**
 * A database block, AFFiNE-style and non-relational: a title, a table of rows
 * and typed columns, and an optional sort. Stored as a `database` line with
 * `attrs.title`, `attrs.columns` and `attrs.sort` (each left out at its
 * default) and its rows as child lines. It sits only at the top of a note, so
 * a database never ends up inside a row page, a column or a callout.
 */
export const Database = Node.create<DatabaseOptions>({
	name: DATABASE,
	content: `${DATABASE_ROW}*`,
	atom: true,
	isolating: true,
	selectable: true,
	draggable: false,

	addOptions() {
		return { pageExtensions: () => [] };
	},

	addAttributes() {
		return {
			title: {
				default: "",
				parseHTML: (element) => element.getAttribute("data-title") ?? "",
				renderHTML: (attributes) =>
					attributes.title ? { "data-title": attributes.title } : {},
			},
			columns: jsonAttr("columns", FALLBACK_COLUMNS),
			sort: jsonAttr("sort", null),
		};
	},

	parseHTML() {
		return [{ tag: 'div[data-type="database"]' }];
	},

	renderHTML({ HTMLAttributes }) {
		return [
			"div",
			mergeAttributes(HTMLAttributes, { "data-type": "database" }),
			0,
		];
	},

	addNodeView() {
		return ReactNodeViewRenderer(DatabaseView);
	},
});

/** The column header: its name, and a menu to rename, retype, sort, move or delete it. */
function HeaderCell({
	column,
	index,
	count,
	editable,
	sorted,
	act,
	onResize,
}: {
	column: DbColumn;
	index: number;
	count: number;
	editable: boolean;
	sorted: "asc" | "desc" | null;
	act: Actions;
	onResize: (event: ReactPointerEvent<HTMLElement>) => void;
}) {
	const [open, setOpen] = useState(false);
	const Icon = TYPE_ICONS[column.type];
	const isTitle = column.id === TITLE_ID;
	const close = () => setOpen(false);
	return (
		<th className="db-th" scope="col" data-column-type={column.type}>
			<Popover open={editable && open} onOpenChange={setOpen}>
				<PopoverTrigger asChild>
					<button
						type="button"
						className="db-th-button"
						disabled={!editable}
						title={COLUMN_TYPE_LABELS[column.type]}
					>
						<Icon className="db-th-icon" aria-hidden="true" />
						<span className="db-th-name">{column.name || "Untitled"}</span>
						{sorted === "asc" && (
							<ArrowUp className="db-th-sort" aria-label="Sorted ascending" />
						)}
						{sorted === "desc" && (
							<ArrowDown
								className="db-th-sort"
								aria-label="Sorted descending"
							/>
						)}
					</button>
				</PopoverTrigger>
				<PopoverContent className="db-popover db-column-menu" align="start">
					<input
						className="db-picker-input"
						aria-label="Column name"
						value={column.name}
						placeholder="Column name"
						onChange={(e) => act.renameColumn(column.id, e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter") {
								e.preventDefault();
								close();
							}
						}}
					/>
					{!isTitle && (
						<>
							<p className="db-menu-heading">Type</p>
							<div className="db-type-list">
								{PICKABLE_TYPES.map((type) => {
									const TypeIcon = TYPE_ICONS[type];
									return (
										<button
											key={type}
											type="button"
											className="db-menu-item"
											aria-pressed={column.type === type}
											onClick={() => act.changeType(column.id, type)}
										>
											<TypeIcon aria-hidden="true" />
											{COLUMN_TYPE_LABELS[type]}
										</button>
									);
								})}
							</div>
						</>
					)}
					<div className="db-menu-sep" />
					<button
						type="button"
						className="db-menu-item"
						aria-pressed={sorted === "asc"}
						onClick={() => {
							act.sort(
								sorted === "asc" ? null : { column: column.id, dir: "asc" },
							);
							close();
						}}
					>
						<ArrowUp aria-hidden="true" /> Sort ascending
					</button>
					<button
						type="button"
						className="db-menu-item"
						aria-pressed={sorted === "desc"}
						onClick={() => {
							act.sort(
								sorted === "desc" ? null : { column: column.id, dir: "desc" },
							);
							close();
						}}
					>
						<ArrowDown aria-hidden="true" /> Sort descending
					</button>
					{!isTitle && (
						<>
							<button
								type="button"
								className="db-menu-item"
								disabled={index <= 1}
								onClick={() => act.moveColumn(column.id, -1)}
							>
								<ArrowLeft aria-hidden="true" /> Move left
							</button>
							<button
								type="button"
								className="db-menu-item"
								disabled={index >= count - 1}
								onClick={() => act.moveColumn(column.id, 1)}
							>
								<ArrowRight aria-hidden="true" /> Move right
							</button>
							<div className="db-menu-sep" />
							<button
								type="button"
								className="db-menu-item db-danger"
								onClick={() => {
									close();
									act.deleteColumn(column.id);
								}}
							>
								<Trash2 aria-hidden="true" /> Delete column
							</button>
						</>
					)}
				</PopoverContent>
			</Popover>
			{editable && (
				<span
					className="db-resize"
					title={`Resize ${column.name || "column"}`}
					aria-hidden="true"
					onPointerDown={onResize}
				/>
			)}
		</th>
	);
}

interface Actions {
	renameColumn: (id: string, name: string) => void;
	changeType: (id: string, type: ColumnType) => void;
	moveColumn: (id: string, delta: -1 | 1) => void;
	deleteColumn: (id: string) => void;
	sort: (sort: { column: string; dir: "asc" | "desc" } | null) => void;
}

/** The mark on a row that is a note: opens the note, or says it can't be found. */
function NoteMark({
	name,
	known,
	onOpen,
}: {
	/** The note's name now; null when it is gone, undefined before it is known. */
	name: string | null | undefined;
	known: boolean;
	onOpen: () => void;
}) {
	const gone = known && name === null;
	return (
		<button
			type="button"
			className="db-row-note"
			data-missing={gone ? "true" : undefined}
			disabled={gone}
			title={gone ? "Note not found" : `Open note ${name ?? ""}`.trim()}
			aria-label={gone ? "Note not found" : "Open note"}
			onClick={onOpen}
		>
			<FileText aria-hidden="true" />
		</button>
	);
}

function DatabaseView({ node, editor, getPos, extension }: NodeViewProps) {
	const pos = useCallback((): number | undefined => {
		const at = getPos();
		return typeof at === "number" ? at : undefined;
	}, [getPos]);
	const db = useMemo(() => databaseFromNode(node, 0), [node]);
	const editable = editor.isEditable;
	const source = useLinkSource(editor);
	const pageExtensions = useMemo(
		() => extension.options.pageExtensions(),
		[extension],
	);
	const [peekId, setPeekId] = useState<string | null>(null);
	const [focusRow, setFocusRow] = useState<string | null>(null);
	// Width while a column edge is being dragged; saved on release.
	const [dragWidth, setDragWidth] = useState<{
		id: string;
		width: number;
	} | null>(null);

	const order = sortedOrder(
		db.rows.map((r) => r.cells),
		db.columns,
		db.sort,
	);

	const withPos = <T,>(run: (at: number) => T): T | undefined => {
		const at = pos();
		return at === undefined ? undefined : run(at);
	};

	const act: Actions = {
		renameColumn: (id, name) =>
			withPos((at) => updateColumn(editor, at, id, { name })),
		changeType: (id, type) =>
			withPos((at) => changeColumnType(editor, at, id, type)),
		moveColumn: (id, delta) =>
			withPos((at) => moveColumn(editor, at, id, delta)),
		deleteColumn: (id) => withPos((at) => deleteColumn(editor, at, id)),
		sort: (sort) => withPos((at) => setSort(editor, at, sort)),
	};

	const newRow = () => {
		const id = withPos((at) => addRow(editor, at));
		if (id) setFocusRow(id);
	};

	const startResize =
		(column: DbColumn) => (event: ReactPointerEvent<HTMLElement>) => {
			event.preventDefault();
			const startX = event.clientX;
			const startWidth = column.width ?? DEFAULT_WIDTH;
			let width = startWidth;
			const move = (e: PointerEvent) => {
				width = clampWidth(startWidth + e.clientX - startX);
				setDragWidth({ id: column.id, width });
			};
			const up = () => {
				window.removeEventListener("pointermove", move);
				window.removeEventListener("pointerup", up);
				setDragWidth(null);
				if (width !== startWidth)
					withPos((at) => updateColumn(editor, at, column.id, { width }));
			};
			window.addEventListener("pointermove", move);
			window.addEventListener("pointerup", up);
		};

	const widthOf = (column: DbColumn) =>
		dragWidth?.id === column.id
			? dragWidth.width
			: (column.width ?? DEFAULT_WIDTH);

	const cellHandlers = (rowId: string, column: DbColumn) => ({
		onChange: (value: CellValue) => {
			setCell(editor, rowId, column.id, value);
			// A row that is a note keeps the note's name the same as its own.
			if (column.id === TITLE_ID && typeof value === "string")
				syncRowName(editor, rowId, value);
		},
		onOptionChange: (next: DbColumn, value: CellValue) =>
			withPos((at) => setOptionCell(editor, at, rowId, next, value)),
	});

	const peekRow = db.rows.find((r) => r.id === peekId);
	const sortColumn = db.sort
		? db.columns.find((c) => c.id === db.sort?.column)
		: undefined;

	return (
		<NodeViewWrapper className="database-block" data-type="database">
			<div className="db-chrome" contentEditable={false}>
				<div className="db-head">
					<input
						className="db-title"
						aria-label="Database name"
						placeholder="Untitled database"
						value={db.title}
						readOnly={!editable}
						onChange={(e) =>
							withPos((at) => setTitle(editor, at, e.target.value))
						}
						onKeyDown={(e) => {
							if (e.key === "Enter" || e.key === "Escape") {
								e.preventDefault();
								e.currentTarget.blur();
							}
						}}
					/>
					{sortColumn && db.sort && (
						<span className="db-sort-chip">
							{db.sort.dir === "asc" ? (
								<ArrowUp aria-hidden="true" />
							) : (
								<ArrowDown aria-hidden="true" />
							)}
							{sortColumn.name || "Untitled"}
							{editable && (
								<button
									type="button"
									className="db-icon-button"
									aria-label="Clear sort"
									onClick={() => act.sort(null)}
								>
									<X aria-hidden="true" />
								</button>
							)}
						</span>
					)}
					{editable && (
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<button
									type="button"
									className="db-add-property"
									aria-label="Add property"
								>
									<Plus aria-hidden="true" />
									<span>Property</span>
								</button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end">
								{PICKABLE_TYPES.map((type) => {
									const TypeIcon = TYPE_ICONS[type];
									return (
										<DropdownMenuItem
											key={type}
											onSelect={() =>
												withPos((at) => addColumn(editor, at, type))
											}
										>
											<TypeIcon aria-hidden="true" />
											{COLUMN_TYPE_LABELS[type]}
										</DropdownMenuItem>
									);
								})}
							</DropdownMenuContent>
						</DropdownMenu>
					)}
				</div>
				<div className="db-scroll">
					<table className="db-table">
						<colgroup>
							{db.columns.map((c) => (
								<col key={c.id} style={{ width: widthOf(c) }} />
							))}
						</colgroup>
						<thead>
							<tr>
								{db.columns.map((column, index) => (
									<HeaderCell
										key={column.id}
										column={column}
										index={index}
										count={db.columns.length}
										editable={editable}
										sorted={db.sort?.column === column.id ? db.sort.dir : null}
										act={act}
										onResize={startResize(column)}
									/>
								))}
							</tr>
						</thead>
						<tbody>
							{order.map((index) => {
								const row = db.rows[index];
								if (!row) return null;
								return (
									<tr
										key={row.id || index}
										className="db-row"
										data-row-id={row.id}
									>
										{db.columns.map((column) => (
											<td
												key={column.id}
												className="db-td"
												data-column-type={column.type}
												data-note={
													column.id === TITLE_ID && row.noteId
														? "true"
														: undefined
												}
											>
												<Cell
													column={column}
													cells={row.cells}
													editable={editable}
													placeholder={
														column.id === TITLE_ID ? "Untitled" : undefined
													}
													autoFocus={
														column.id === TITLE_ID && focusRow === row.id
													}
													{...cellHandlers(row.id, column)}
												/>
												{column.id === TITLE_ID && row.noteId && (
													<NoteMark
														name={source?.describe("note", row.noteId)}
														known={source !== null}
														onOpen={() =>
															source?.open({
																kind: "note",
																target: row.noteId ?? "",
																label: "",
															})
														}
													/>
												)}
												{column.id === TITLE_ID && (
													<span className="db-row-gutter">
														{editable && (
															<DropdownMenu>
																<DropdownMenuTrigger asChild>
																	<button
																		type="button"
																		className="db-icon-button db-row-menu"
																		aria-label="Row menu"
																	>
																		<Ellipsis aria-hidden="true" />
																	</button>
																</DropdownMenuTrigger>
																<DropdownMenuContent align="start">
																	<DropdownMenuItem
																		onSelect={() => setPeekId(row.id)}
																	>
																		<PanelRightOpen aria-hidden="true" /> Open
																	</DropdownMenuItem>
																	<DropdownMenuSeparator />
																	<DropdownMenuItem
																		variant="destructive"
																		onSelect={() => deleteRow(editor, row.id)}
																	>
																		<Trash2 aria-hidden="true" /> Delete row
																	</DropdownMenuItem>
																</DropdownMenuContent>
															</DropdownMenu>
														)}
													</span>
												)}
												{column.id === TITLE_ID && (
													<button
														type="button"
														className="db-open"
														onClick={() => setPeekId(row.id)}
														title="Open row page"
													>
														<PanelRightOpen aria-hidden="true" />
														Open
													</button>
												)}
											</td>
										))}
									</tr>
								);
							})}
						</tbody>
					</table>
					{db.rows.length === 0 && <p className="db-empty-hint">No rows yet</p>}
				</div>
				{editable && (
					<button
						type="button"
						className="db-new-row"
						aria-label="New row"
						onClick={newRow}
					>
						<Plus aria-hidden="true" /> New
					</button>
				)}
			</div>
			{/* The rows' blocks stay in the document; the table above draws them. */}
			<NodeViewContent className="db-store" />
			{peekRow && (
				<RowPeek
					key={peekRow.id}
					editor={editor}
					row={{
						id: peekRow.id,
						cells: peekRow.cells,
						content: peekRow.node.content.toJSON() ?? [],
						noteId: peekRow.noteId,
					}}
					columns={db.columns}
					dbPos={pos}
					pageExtensions={pageExtensions}
					onClose={() => setPeekId(null)}
				/>
			)}
		</NodeViewWrapper>
	);
}
