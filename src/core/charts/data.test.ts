import { describe, expect, it } from "vitest";
import type { CellValue, DbColumn } from "../../editor/database/model";
import { barLayout, buildChartData, chartColor, pieLayout } from "./data";

const columns: DbColumn[] = [
	{ id: "label", name: "Group", type: "text" },
	{ id: "n", name: "Count", type: "number" },
];
const row = (label: string, n: CellValue) => ({ cells: { label, n } });
describe("chart data", () => {
	it("aggregates repeated labels and ignores non-numbers", () => {
		expect(
			buildChartData(
				[row("A", 2), row("A", 4), row("B", "4")],
				columns,
				"label",
				["n"],
				"average",
			).points,
		).toEqual([
			{ label: "A", values: { n: 3 } },
			{ label: "B", values: { n: 0 } },
		]);
	});
	it("counts numeric cells in each repeated-label group", () => {
		expect(
			buildChartData(
				[row("A", 2), row("A", null), row("A", 8)],
				columns,
				"label",
				["n"],
				"count",
			).points[0]?.values.n,
		).toBe(2);
	});
	it("lays negative bars below the zero line", () => {
		const data = buildChartData(
			[row("Loss", -5), row("Gain", 5)],
			columns,
			"label",
			["n"],
			"sum",
		);
		expect(barLayout(data)[0]).toMatchObject({ y: 28, height: 24 });
	});
	it("handles empty and single row data, and stable colors", () => {
		expect(buildChartData([], columns, "label", ["n"], "sum").points).toEqual(
			[],
		);
		const data = buildChartData(
			[row("One", 7)],
			columns,
			"label",
			["n"],
			"sum",
		);
		expect(data.points).toHaveLength(1);
		expect(barLayout(data)[0]?.height).toBe(48);
		expect(chartColor("n")).toBe(chartColor("n"));
	});
	it("combines pie overflow into Other", () => {
		const data = buildChartData(
			Array.from({ length: 10 }, (_, i) => row(`L${i}`, i + 1)),
			columns,
			"label",
			["n"],
			"sum",
		);
		expect(pieLayout(data)).toHaveLength(8);
		expect(pieLayout(data).at(-1)?.label).toBe("Other");
	});
});
