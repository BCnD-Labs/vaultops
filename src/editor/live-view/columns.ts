import type { PropertyType } from "../../core/notes/properties";
import type { MatchRow } from "../../core/views/match";
import type { ViewField } from "../../core/views/row";
import { propName } from "../../core/views/rule";
import type { Cells, ColumnType, DbColumn } from "../database/model";

/** Property types as database column types (the design's `propToColumn`). */
const COLUMN_OF: Readonly<Record<PropertyType, ColumnType>> = {
	text: "text",
	number: "number",
	date: "date",
	checkbox: "checkbox",
	select: "select",
	list: "multiSelect",
};

/**
 * A view column as a database column, so the table reuses the database
 * block's cells. Option ids are the option names: a property stores names.
 */
export function propToColumn(
	id: string,
	name: string,
	field: ViewField | undefined,
): DbColumn {
	const type = field ? COLUMN_OF[field.type] : "text";
	if (type !== "select" && type !== "multiSelect") return { id, name, type };
	const v = field?.value;
	const names = new Set([
		...(field?.options ?? []),
		...(Array.isArray(v) ? v : typeof v === "string" && v !== "" ? [v] : []),
	]);
	return {
		id,
		name,
		type,
		options: [...names].map((n) => ({ id: n, name: n, tone: "gray" })),
	};
}

/** A view column's header (name and type), from the first row that has it. */
export function columnHeader(
	field: string,
	rows: readonly MatchRow[],
): DbColumn {
	if (field === "title") return { id: field, name: "Name", type: "title" };
	if (field === "type") return { id: field, name: "Type", type: "text" };
	const name = propName(field) ?? field;
	const key = name.toLowerCase();
	const found = rows.find((row) => row.fields[key])?.fields[key];
	return propToColumn(field, found?.name ?? name, found);
}

/** One row's cell for a view column, in the database cell shape. */
export function cellOf(
	field: string,
	row: MatchRow,
): { column: DbColumn; cells: Cells } {
	if (field === "type")
		return {
			column: { id: field, name: "Type", type: "text" },
			cells: { [field]: row.type ?? null },
		};
	const name = propName(field) ?? field;
	const f = row.fields[name.toLowerCase()];
	return {
		column: propToColumn(field, f?.name ?? name, f),
		cells: { [field]: f?.value ?? null },
	};
}
