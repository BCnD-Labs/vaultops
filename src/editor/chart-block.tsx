import { mergeAttributes, Node } from "@tiptap/core";
import {
	type NodeViewProps,
	NodeViewWrapper,
	ReactNodeViewRenderer,
} from "@tiptap/react";
import { useEffect, useState } from "react";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	type Aggregation,
	barLayout,
	buildChartData,
	type ChartKind,
	chartColor,
	pieLayout,
} from "../core/charts/data";
import { DATABASE, databaseFromNode } from "./database/commands";
import type { Cells, DbColumn } from "./database/model";
import "./chart-block.css";

export interface ChartAttrs {
	databaseId: string;
	labelColumn: string;
	valueColumns: string[];
	kind: ChartKind;
	aggregation: Aggregation;
}
export const MISSING_CHART_TEXT = "This chart's table is gone";
const kinds: ChartKind[] = ["bar", "pie"];
const measures: Aggregation[] = ["sum", "average", "count"];
function validKind(value: unknown): ChartKind {
	return kinds.includes(value as ChartKind) ? (value as ChartKind) : "bar";
}
function dbId(node: { attrs: Record<string, unknown> }): string {
	return typeof node.attrs.id === "string" ? node.attrs.id : "";
}
function firstNumberId(columns: readonly DbColumn[]): string[] {
	const first = columns.find((column) => column.type === "number");
	return first ? [first.id] : [];
}

function Picker({
	label,
	value,
	options,
	onChange,
}: {
	label: string;
	value: string;
	options: { id: string; name: string }[];
	onChange: (value: string) => void;
}) {
	return (
		<div className="chart-picker">
			<span>{label}</span>
			<Select value={value} onValueChange={onChange}>
				<SelectTrigger aria-label={label}>
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					{options.map((option) => (
						<SelectItem key={option.id} value={option.id}>
							{option.name}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);
}

function ChartView({ node, editor, getPos }: NodeViewProps) {
	const [, setRevision] = useState(0);
	useEffect(() => {
		const update = () => setRevision((value) => value + 1);
		editor.on("transaction", update);
		return () => {
			editor.off("transaction", update);
		};
	}, [editor]);
	const attrs = node.attrs as ChartAttrs;
	const databases: {
		id: string;
		title: string;
		columns: DbColumn[];
		rows: { cells: Cells }[];
	}[] = [];
	editor.state.doc.descendants((candidate) => {
		if (candidate.type.name === DATABASE && dbId(candidate)) {
			const data = databaseFromNode(candidate, 0);
			databases.push({
				id: dbId(candidate),
				title: data.title || "Untitled table",
				columns: data.columns,
				rows: data.rows,
			});
		}
	});
	const table = databases.find((db) => db.id === attrs.databaseId);
	const numbers =
		table?.columns.filter((column) => column.type === "number") ?? [];
	const labels = table?.columns ?? [];
	const change = (patch: Partial<ChartAttrs>) => {
		if (!editor.isEditable) return;
		const pos = getPos();
		if (typeof pos !== "number") return;
		editor.view.dispatch(
			editor.state.tr.setNodeMarkup(pos, undefined, {
				...node.attrs,
				...patch,
			}),
		);
	};
	const values = attrs.valueColumns.length
		? attrs.valueColumns.filter((id) =>
				numbers.some((column) => column.id === id),
			)
		: numbers.slice(0, 1).map((column) => column.id);
	const chart = table
		? buildChartData(
				table.rows,
				table.columns,
				attrs.labelColumn || table.columns[0]?.id || "",
				values,
				measures.includes(attrs.aggregation) ? attrs.aggregation : "sum",
			)
		: null;
	const editable = editor.isEditable;
	if (!table)
		return (
			<NodeViewWrapper className="chart-block" contentEditable={false}>
				<div className="chart-missing">
					{attrs.databaseId
						? MISSING_CHART_TEXT
						: databases.length
							? "Choose a table for this chart"
							: "Add a database block to make a chart"}
				</div>
				{editable && databases.length > 0 && (
					<div className="chart-reconnect">
						<Picker
							label="Choose a table"
							value=""
							options={databases.map(({ id, title }) => ({ id, name: title }))}
							onChange={(id) => {
								const db = databases.find((item) => item.id === id);
								change({
									databaseId: id,
									labelColumn: db?.columns[0]?.id ?? "",
									valueColumns: firstNumberId(db?.columns ?? []),
								});
							}}
						/>
					</div>
				)}
			</NodeViewWrapper>
		);
	return (
		<NodeViewWrapper className="chart-block" contentEditable={false}>
			{editable && (
				<div className="chart-setup">
					<Picker
						label="Table"
						value={attrs.databaseId}
						options={databases.map(({ id, title }) => ({ id, name: title }))}
						onChange={(id) => {
							const db = databases.find((item) => item.id === id);
							change({
								databaseId: id,
								labelColumn: db?.columns[0]?.id ?? "",
								valueColumns: firstNumberId(db?.columns ?? []),
							});
						}}
					/>
					<Picker
						label="Labels"
						value={attrs.labelColumn || labels[0]?.id || ""}
						options={labels.map(({ id, name }) => ({
							id,
							name: name || "Untitled",
						}))}
						onChange={(labelColumn) => change({ labelColumn })}
					/>
					<label>
						Values{" "}
						<select
							multiple
							value={values}
							onChange={(e) =>
								change({
									valueColumns: Array.from(
										e.currentTarget.selectedOptions,
										(option) => option.value,
									),
								})
							}
						>
							{numbers.map((column) => (
								<option key={column.id} value={column.id}>
									{column.name || "Untitled"}
								</option>
							))}
						</select>
					</label>
					<Picker
						label="Kind"
						value={validKind(attrs.kind)}
						options={kinds.map((id) => ({ id, name: id }))}
						onChange={(kind) => change({ kind: validKind(kind) })}
					/>
					<Picker
						label="Combine"
						value={attrs.aggregation || "sum"}
						options={measures.map((id) => ({ id, name: id }))}
						onChange={(aggregation) =>
							change({ aggregation: aggregation as Aggregation })
						}
					/>
				</div>
			)}
			{chart && <ChartSvg data={chart} kind={validKind(attrs.kind)} />}
		</NodeViewWrapper>
	);
}

function ChartSvg({
	data,
	kind,
}: {
	data: ReturnType<typeof buildChartData>;
	kind: ChartKind;
}) {
	if (!data.points.length || !data.series.length)
		return (
			<div className="chart-empty">
				Add a label and number to see this chart.
			</div>
		);
	if (kind === "pie") {
		const slices = pieLayout(data);
		return (
			<svg
				className="chart-svg chart-pie"
				viewBox="0 0 100 100"
				role="img"
				aria-label="Pie chart"
			>
				{slices.map((slice) => {
					const large = slice.end - slice.start > Math.PI ? 1 : 0;
					const point = (angle: number) => [
						50 + 42 * Math.cos(angle),
						50 + 42 * Math.sin(angle),
					];
					const a = point(slice.start);
					const b = point(slice.end);
					const path = `M 50 50 L ${a[0]} ${a[1]} A 42 42 0 ${large} 1 ${b[0]} ${b[1]} Z`;
					return (
						<path
							key={slice.label}
							d={path}
							fill={chartColor(slice.label)}
							className="chart-mark"
						>
							<title>
								{slice.label}: {slice.value}
							</title>
						</path>
					);
				})}
			</svg>
		);
	}
	const rects = barLayout(data);
	return (
		<svg
			className="chart-svg"
			viewBox="0 0 100 60"
			role="img"
			aria-label="Bar chart"
		>
			{rects.map((rect, index) => {
				const point = data.points[Math.floor(index / data.series.length)];
				const series = data.series[index % data.series.length];
				return (
					<rect
						key={`${point?.label}-${series?.id}`}
						{...rect}
						rx="1"
						fill={series?.color}
					>
						<title>
							{point?.label} · {series?.name}: {point?.values[series?.id ?? ""]}
						</title>
					</rect>
				);
			})}
		</svg>
	);
}

/** A chart references one database in this note; attrs: databaseId, labelColumn, valueColumns, kind, aggregation. */
export const ChartBlock = Node.create({
	name: "chart",
	group: "block",
	atom: true,
	selectable: true,
	draggable: true,
	addAttributes() {
		return {
			databaseId: {
				default: "",
				parseHTML: (el: HTMLElement) => el.dataset.databaseId ?? "",
				renderHTML: (attrs: Record<string, unknown>) =>
					attrs.databaseId ? { "data-database-id": attrs.databaseId } : {},
			},
			labelColumn: {
				default: "",
				parseHTML: (el: HTMLElement) => el.dataset.labelColumn ?? "",
				renderHTML: (attrs: Record<string, unknown>) =>
					attrs.labelColumn ? { "data-label-column": attrs.labelColumn } : {},
			},
			valueColumns: {
				default: [],
				parseHTML: (el: HTMLElement) => {
					try {
						return JSON.parse(el.dataset.valueColumns ?? "[]");
					} catch {
						return [];
					}
				},
				renderHTML: (attrs: Record<string, unknown>) =>
					Array.isArray(attrs.valueColumns) && attrs.valueColumns.length
						? { "data-value-columns": JSON.stringify(attrs.valueColumns) }
						: {},
			},
			kind: {
				default: "bar",
				parseHTML: (el: HTMLElement) => el.dataset.kind ?? "bar",
				renderHTML: (attrs: Record<string, unknown>) =>
					attrs.kind !== "bar" ? { "data-kind": attrs.kind } : {},
			},
			aggregation: {
				default: "sum",
				parseHTML: (el: HTMLElement) => el.dataset.aggregation ?? "sum",
				renderHTML: (attrs: Record<string, unknown>) =>
					attrs.aggregation !== "sum"
						? { "data-aggregation": attrs.aggregation }
						: {},
			},
		};
	},
	parseHTML() {
		return [{ tag: 'div[data-type="chart"]' }];
	},
	renderHTML({ HTMLAttributes }) {
		return ["div", mergeAttributes(HTMLAttributes, { "data-type": "chart" })];
	},
	addNodeView() {
		return ReactNodeViewRenderer(ChartView, { ignoreMutation: () => true });
	},
});
