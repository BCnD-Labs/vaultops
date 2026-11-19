import { mergeAttributes, Node } from "@tiptap/core";
import {
	type NodeViewProps,
	NodeViewWrapper,
	ReactNodeViewRenderer,
} from "@tiptap/react";
import { ArrowDown, ArrowUp } from "lucide-react";
import {
	createContext,
	Fragment,
	type RefObject,
	useContext,
	useEffect,
	useMemo,
	useState,
	useSyncExternalStore,
} from "react";
import { Button } from "@/components/ui/button";
import { useInViewport } from "@/components/ui/use-in-viewport";
import type { PropsEdit, PropsWrite } from "../../app/live-documents";
import type { ViewRow } from "../../app/view-rows";
import type { PropertyValue } from "../../core/notes/properties";
import { knownProps, viewChoices } from "../../core/views/edit";
import { compileRule } from "../../core/views/match";
import { propName } from "../../core/views/rule";
import { groupRows, sortRows } from "../../core/views/sort";
import {
	BUILT_LAYOUTS,
	DEFAULT_LIMIT as PAGE,
	readViewSettings,
	VIEW_VERSION,
} from "../../core/views/view-attrs";
import { Cell } from "../database/cells";
import { jsonAttr } from "../database/database";
import { TYPE_ICONS } from "../database/icons";
import {
	type CellValue,
	type DbColumn,
	DEFAULT_WIDTH,
} from "../database/model";
import { todayIso } from "../date-chip";
import { cellEdit, cellOf, cellToValue, columnHeader } from "./columns";
import { RuleEditor } from "./rule-editor";
import "./live-view.css";

export const LIVE_VIEW = "liveView";

/** What a note's views read: the vault's rows, the note that holds them, and how to open a row. */
export interface LiveViewSource {
	rows: {
		subscribe: (listener: () => void) => () => void;
		getSnapshot: () => readonly ViewRow[];
	};
	hostPath: string | null;
	open: (path: string) => void;
	/** Change a note's properties; left out, cells are read-only. */
	setProps?: (noteId: string, edit: PropsEdit) => Promise<PropsWrite>;
}

export const LiveViewSource = createContext<LiveViewSource | null>(null);

const NO_ROWS: readonly ViewRow[] = [];
const NO_STORE: LiveViewSource["rows"] = {
	subscribe: () => () => {},
	getSnapshot: () => NO_ROWS,
};

/** A cell edit shown before the note's row catches up (names as option ids). */
interface Override {
	path: string;
	field: string;
	value: PropertyValue;
	column: DbColumn;
}
const fieldValue = (row: ViewRow, field: string) =>
	row.fields[(propName(field) ?? field).toLowerCase()]?.value ?? null;
const same = (a: unknown, b: unknown) =>
	JSON.stringify(a) === JSON.stringify(b);

/** Why a cell can't be edited, for its tooltip; null when it can. */
function lockedBecause(row: ViewRow, field: string): string | null {
	if (row.readOnly || !row.id)
		return "This note is read-only (damaged or made by a newer version).";
	if (field === "type")
		return "A note's type can't be changed from a view yet.";
	return null;
}

function LiveViewNode({
	node,
	editor,
	getPos,
	updateAttributes,
}: NodeViewProps) {
	const source = useContext(LiveViewSource);
	const store = source?.rows ?? NO_STORE;
	const rows = useSyncExternalStore(store.subscribe, store.getSnapshot);
	const hostPath = source?.hostPath ?? null;
	const settings = useMemo(() => readViewSettings(node.attrs), [node.attrs]);
	const [more, setMore] = useState(0);
	const [overrides, setOverrides] = useState<ReadonlyMap<string, Override>>(
		() => new Map(),
	);
	const [problem, setProblem] = useState<string | null>(null);
	// An edit stops showing once its note's row has the value (or it failed).
	useEffect(() => {
		setOverrides((now) => {
			const byPath = new Map(rows.map((row) => [row.path, row]));
			const next = new Map(
				[...now].filter(([, o]) => {
					const row = byPath.get(o.path);
					return row && !same(fieldValue(row, o.field), o.value);
				}),
			);
			return next.size === now.size ? now : next;
		});
	}, [rows]);
	const writable = editor.isEditable && !!source?.setProps;
	const editCell = (
		row: ViewRow,
		field: string,
		column: DbColumn,
		cell: CellValue,
	) => {
		const setProps = source?.setProps;
		if (!row.id || !setProps) return;
		const key = `${row.path}\n${field}`;
		const value = cellToValue(column, cell);
		const options = column.options?.map((o) => ({ ...o, id: o.name }));
		const override = {
			path: row.path,
			field,
			value,
			column: { ...column, options },
		};
		setProblem(null);
		setOverrides((now) => new Map(now).set(key, override));
		void setProps(row.id, cellEdit(column, value)).then((result) => {
			if (result.ok) return;
			setProblem(result.message);
			setOverrides((now) => {
				if (now.get(key) !== override) return now;
				const next = new Map(now);
				next.delete(key);
				return next;
			});
		});
	};
	// A view scrolled out of sight does no work.
	const { ref, visible } = useInViewport();
	// What the menus offer, and which properties exist (a condition on any other matches nothing).
	const choices = useMemo(
		() => (visible && !settings.newer ? viewChoices(rows) : null),
		[visible, settings.newer, rows],
	);
	const result = useMemo(() => {
		if (!choices) return null;
		const test = compileRule(settings.rule, {
			today: todayIso(),
			hostPath: hostPath ?? undefined,
			linksOf: (id) => rows.find((row) => row.id === id)?.links,
			knownProps: knownProps(choices),
		});
		const matched = rows.filter(test);
		const shown = sortRows(matched, settings.sort, settings.limit + more);
		return {
			total: matched.length,
			shown,
			groups: settings.group ? groupRows(shown, settings.group) : null,
		};
	}, [choices, settings, rows, hostPath, more]);
	// The stored conditions as written, so a half-finished one keeps its place.
	const rawRule = useMemo(() => {
		const stored = node.attrs.rule;
		const conditions =
			stored && Array.isArray(stored.conditions)
				? stored.conditions.filter(
						(c: unknown) => typeof c === "object" && c !== null,
					)
				: [];
		return { match: settings.rule.match, conditions };
	}, [node.attrs.rule, settings.rule.match]);
	const change = (patch: Record<string, unknown>) => {
		if (editor.isEditable)
			updateAttributes({ v: node.attrs.v ?? VIEW_VERSION, ...patch });
	};
	const fields = settings.columns.slice(1);
	const headers = settings.columns.map((field) =>
		columnHeader(field, result?.shown ?? []),
	);
	const setTitle = (title: string) => {
		const pos = getPos();
		if (!editor.isEditable || typeof pos !== "number") return;
		editor.view.dispatch(
			editor.state.tr.setNodeMarkup(pos, undefined, {
				...node.attrs,
				title: title === "" ? null : title,
			}),
		);
	};

	return (
		<NodeViewWrapper
			className="database-block live-view"
			data-type="live-view"
			contentEditable={false}
		>
			<div className="db-chrome" ref={ref as RefObject<HTMLDivElement>}>
				<div className="db-head">
					<input
						className="db-title"
						aria-label="View name"
						placeholder="Untitled view"
						value={settings.title}
						readOnly={!editor.isEditable}
						onChange={(e) => setTitle(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter" || e.key === "Escape") {
								e.preventDefault();
								e.currentTarget.blur();
							}
						}}
					/>
					{result && (
						<span className="lv-count">
							{result.total === 1 ? "1 note" : `${result.total} notes`}
						</span>
					)}
					{editor.isEditable && choices && (
						<RuleEditor
							rule={rawRule}
							settings={settings}
							choices={choices}
							today={todayIso()}
							onChange={change}
						/>
					)}
				</div>
				{!BUILT_LAYOUTS.includes(settings.layout) && (
					<p className="lv-note">
						The {settings.layout} layout isn't built yet; showing a table.
					</p>
				)}
				{settings.newer ? (
					<p className="db-empty-hint">
						This view was made by a newer version of VaultOps.
					</p>
				) : (
					<div className="db-scroll">
						<table className="db-table">
							<colgroup>
								{headers.map((column) => (
									<col
										key={column.id}
										style={{
											width: DEFAULT_WIDTH * (column.type === "title" ? 2 : 1),
										}}
									/>
								))}
							</colgroup>
							<thead>
								<tr>
									{headers.map((column) => {
										const Icon = TYPE_ICONS[column.type];
										const dir = settings.sort.find(
											(key) => key.field === column.id,
										)?.dir;
										const Arrow = dir === "desc" ? ArrowDown : ArrowUp;
										return (
											<th
												key={column.id}
												className="db-th"
												scope="col"
												data-column-type={column.type}
											>
												<div className="db-th-button">
													<Icon className="db-th-icon" aria-hidden="true" />
													<span className="db-th-name">{column.name}</span>
													{dir && (
														<Arrow
															className="db-th-sort"
															aria-label={`Sorted ${dir === "asc" ? "ascending" : "descending"}`}
														/>
													)}
												</div>
											</th>
										);
									})}
								</tr>
							</thead>
							<tbody>
								{(
									result?.groups ?? [
										{ key: "", label: "", rows: result?.shown ?? [] },
									]
								).map((group) => (
									<Fragment key={group.key ?? "none"}>
										{result?.groups && (
											<tr className="lv-group">
												<th colSpan={headers.length} scope="colgroup">
													{group.label}
													<span>{group.rows.length}</span>
												</th>
											</tr>
										)}
										{group.rows.map((row) => (
											<tr
												key={row.path}
												className="db-row"
												data-path={row.path}
											>
												<td className="db-td" data-column-type="title">
													<Button
														type="button"
														variant="link"
														size="sm"
														className="lv-title"
														onClick={() => source?.open(row.path)}
													>
														{row.title || "Untitled"}
													</Button>
												</td>
												{fields.map((field, i) => {
													const shown = overrides.get(`${row.path}\n${field}`);
													const { column, cells } = shown
														? {
																column: shown.column,
																cells: { [field]: shown.value },
															}
														: cellOf(field, row, headers[i + 1]);
													const locked = lockedBecause(row, field);
													const can = writable && !locked;
													const edit = (value: CellValue, next = column) =>
														can && editCell(row, field, next, value);
													return (
														<td
															key={field}
															className="db-td"
															data-column-type={column.type}
															title={locked ?? undefined}
														>
															<Cell
																column={column}
																cells={cells}
																editable={can}
																onChange={edit}
																onOptionChange={(next, value) =>
																	edit(value, next)
																}
															/>
														</td>
													);
												})}
											</tr>
										))}
									</Fragment>
								))}
							</tbody>
						</table>
						{result?.total === 0 && (
							<p className="db-empty-hint">No notes match this view</p>
						)}
						{problem && (
							<p className="db-empty-hint lv-problem" role="alert">
								Not changed: {problem}
							</p>
						)}
					</div>
				)}
				{result && result.total > result.shown.length && (
					<Button
						type="button"
						variant="ghost"
						size="sm"
						className="db-new-row"
						onClick={() => setMore((n) => n + PAGE)}
					>
						Show more ({result.total - result.shown.length})
					</Button>
				)}
			</div>
		</NodeViewWrapper>
	);
}

/**
 * A live view: a table of the notes that match a rule, kept in the block's
 * attrs (decision D1 A). The rows are never stored in the note; they are read
 * from the vault each time. Every attr defaults to null so a view saves back
 * byte for byte.
 */
export const LiveView = Node.create({
	name: LIVE_VIEW,
	group: "block",
	atom: true,
	selectable: true,
	addAttributes: () =>
		Object.fromEntries(
			[
				"v",
				"title",
				"layout",
				"rule",
				"sort",
				"group",
				"columns",
				"date",
				"limit",
			].map((name) => [name, jsonAttr(name, null)]),
		),
	parseHTML: () => [{ tag: 'div[data-type="live-view"]' }],
	renderHTML: ({ HTMLAttributes }) => [
		"div",
		mergeAttributes(HTMLAttributes, { "data-type": "live-view" }),
		"Live view",
	],
	addNodeView: () =>
		ReactNodeViewRenderer(LiveViewNode, {
			stopEvent: ({ event }) =>
				event.target instanceof Element &&
				event.target.closest("input, textarea, button") !== null,
		}),
});
