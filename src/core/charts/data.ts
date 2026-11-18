import type { Cells, DbColumn } from "../../editor/database/model";

export type ChartKind = "bar" | "pie";
export type Aggregation = "sum" | "average" | "count";
export interface ChartRow {
	cells: Cells;
}
export interface ChartPoint {
	label: string;
	values: Record<string, number>;
}
export interface ChartSeries {
	id: string;
	name: string;
	color: string;
}
export interface ChartData {
	points: ChartPoint[];
	series: ChartSeries[];
}

const colorTokens = [
	"--chart-1",
	"--chart-2",
	"--chart-3",
	"--chart-4",
	"--chart-5",
	"--accent",
	"--primary",
];
/** Stable palette assignment based on the series id; CSS variables follow the active theme. */
export function chartColor(id: string): string {
	let hash = 0;
	for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
	return `var(${colorTokens[hash % colorTokens.length]})`;
}

export function buildChartData(
	rows: readonly ChartRow[],
	columns: readonly DbColumn[],
	labelId: string,
	valueIds: readonly string[],
	aggregation: Aggregation,
): ChartData {
	const labelColumn = columns.find((column) => column.id === labelId);
	const values = valueIds
		.map((id) => columns.find((column) => column.id === id))
		.filter((column): column is DbColumn => column?.type === "number");
	const buckets = new Map<string, Map<string, number[]>>();
	for (const row of rows) {
		const raw = labelColumn ? row.cells[labelColumn.id] : null;
		const label =
			typeof raw === "string" || typeof raw === "number" ? String(raw) : "";
		if (!label) continue;
		const bucket = buckets.get(label) ?? new Map<string, number[]>();
		for (const column of values) {
			const cell = row.cells[column.id];
			if (typeof cell === "number" && Number.isFinite(cell)) {
				const list = bucket.get(column.id) ?? [];
				list.push(cell);
				bucket.set(column.id, list);
			}
		}
		buckets.set(label, bucket);
	}
	const points = [...buckets].map(([label, bucket]) => ({
		label,
		values: Object.fromEntries(
			values.map((column) => {
				const found = bucket.get(column.id) ?? [];
				const value =
					aggregation === "count"
						? found.length
						: aggregation === "average"
							? found.reduce((a, b) => a + b, 0) / (found.length || 1)
							: found.reduce((a, b) => a + b, 0);
				return [column.id, value];
			}),
		),
	}));
	return {
		points,
		series: values.map((column) => ({
			id: column.id,
			name: column.name || "Untitled",
			color: chartColor(column.id),
		})),
	};
}

export interface BarRect {
	x: number;
	y: number;
	width: number;
	height: number;
}
/** Bar coordinates for a vertical grouped chart, in a 100×60 viewBox. */
export function barLayout(data: ChartData): BarRect[] {
	const all = data.points.flatMap((point) => Object.values(point.values));
	const max = Math.max(0, ...all);
	const min = Math.min(0, ...all);
	const range = max - min || 1;
	const zero = 4 + (max / range) * 48;
	const group = 88 / Math.max(1, data.points.length);
	const width = Math.min(10, group / Math.max(1, data.series.length) - 2);
	return data.points.flatMap((point, i) =>
		data.series.map((series, j) => {
			const value = point.values[series.id] ?? 0;
			const height = (Math.abs(value) / range) * 48;
			return {
				x: 6 + i * group + (group - width * data.series.length) / 2 + j * width,
				y: value < 0 ? zero : zero - height,
				width: Math.max(0, width - 1),
				height,
			};
		}),
	);
}

export interface PieSlice {
	label: string;
	value: number;
	start: number;
	end: number;
}
/** Pie slices use the first numeric series and combine overflow into Other. */
export function pieLayout(data: ChartData): PieSlice[] {
	const key = data.series[0]?.id;
	const rows = data.points
		.map((point) => ({
			label: point.label,
			value: Math.max(0, key ? (point.values[key] ?? 0) : 0),
		}))
		.filter((row) => row.value > 0);
	const sorted =
		rows.length > 8
			? [
					...rows.slice(0, 7),
					{
						label: "Other",
						value: rows.slice(7).reduce((sum, row) => sum + row.value, 0),
					},
				]
			: rows;
	const total = sorted.reduce((sum, row) => sum + row.value, 0);
	let angle = -Math.PI / 2;
	return sorted.map(({ label, value }) => {
		const start = angle;
		angle += total ? (value / total) * Math.PI * 2 : 0;
		return { label, value, start, end: angle };
	});
}
