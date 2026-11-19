import {
	addProperty,
	type Change,
	cleanName,
	findName,
	optionsOf,
	type PropertyType,
	type PropertyValue,
	type Props,
	setOptions,
	setValue,
} from "../../core/notes/properties";
import type { MatchRow } from "../../core/views/match";
import type { ViewField } from "../../core/views/row";
import { propName } from "../../core/views/rule";
import type { Cells, CellValue, ColumnType, DbColumn } from "../database/model";

/** Property types as database column types (the design's `propToColumn`). */
const COLUMN_OF: Readonly<Record<PropertyType, ColumnType>> = {
	text: "text",
	number: "number",
	date: "date",
	checkbox: "checkbox",
	select: "select",
	list: "multiSelect",
};

/** Back again: the property type a table column writes. */
const PROPERTY_OF: Partial<Record<ColumnType, PropertyType>> = {
	text: "text",
	number: "number",
	date: "date",
	checkbox: "checkbox",
	select: "select",
	multiSelect: "list",
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

/**
 * One row's cell for a view column, in the database cell shape. A note without
 * the property gets the column's header, so filling the cell adds it.
 */
export function cellOf(
	field: string,
	row: MatchRow,
	header?: DbColumn,
): { column: DbColumn; cells: Cells } {
	if (field === "type")
		return {
			column: { id: field, name: "Type", type: "text" },
			cells: { [field]: row.type ?? null },
		};
	const name = propName(field) ?? field;
	const f = row.fields[name.toLowerCase()];
	return {
		column: !f && header ? header : propToColumn(field, f?.name ?? name, f),
		cells: { [field]: f?.value ?? null },
	};
}

/**
 * A cell's value as the property stores it: option names, not option ids (a
 * new option made in the picker has a fresh id until it is saved).
 */
export function cellToValue(column: DbColumn, value: CellValue): PropertyValue {
	const name = (id: string) =>
		column.options?.find((o) => o.id === id)?.name ?? id;
	if (Array.isArray(value)) return value.map(name);
	return column.type === "select" && typeof value === "string"
		? name(value)
		: value;
}

/**
 * The property change a table cell makes. A missing property is added with the
 * column's type, and a new select option joins the property's options.
 */
export function cellEdit(
	column: DbColumn,
	value: PropertyValue,
): (props: Props) => Change {
	return (props) => {
		const type = PROPERTY_OF[column.type];
		if (!type) return { ok: false, message: "This column can't be edited." };
		let next = props;
		let name = findName(next, column.name);
		if (name === null) {
			const added = addProperty(next, column.name, type);
			if (!added.ok) return added;
			next = added.props;
			name = cleanName(column.name);
		}
		const options = optionsOf(next[name]);
		if (typeof value === "string" && options && !options.includes(value)) {
			const grown = setOptions(next, name, [...options, value]);
			if (!grown.ok) return grown;
			next = grown.props;
		}
		return setValue(next, name, value);
	};
}
