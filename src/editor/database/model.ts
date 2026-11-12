import { TONES, type Tone } from "../../app/appearance";

/**
 * The database block's data model, with no editor or React in it. A database
 * is a `database` block whose attributes hold its title, its columns and its
 * sort; each row is a `databaseRow` child block whose `cells` attribute maps a
 * column id to that row's value, and whose child blocks are the row's page.
 * Everything read from a file goes through the `normalize*` functions, so a
 * hand-edited or older value can never crash the view.
 */

export const COLUMN_TYPES = [
	"title",
	"text",
	"number",
	"select",
	"multiSelect",
	"date",
	"checkbox",
	"url",
	"status",
	"progress",
] as const;
export type ColumnType = (typeof COLUMN_TYPES)[number];

/** The types a user can pick; the title column is fixed and can't be added. */
export const PICKABLE_TYPES = COLUMN_TYPES.filter((t) => t !== "title");

export const COLUMN_TYPE_LABELS: Readonly<Record<ColumnType, string>> = {
	title: "Title",
	text: "Text",
	number: "Number",
	select: "Select",
	multiSelect: "Multi-select",
	date: "Date",
	checkbox: "Checkbox",
	url: "URL",
	status: "Status",
	progress: "Progress",
};

/** The three groups a status option sits in, in the order they show. */
export const STATUS_GROUPS = ["todo", "doing", "done"] as const;
export type StatusGroup = (typeof STATUS_GROUPS)[number];
export const STATUS_GROUP_LABELS: Readonly<Record<StatusGroup, string>> = {
	todo: "To do",
	doing: "In progress",
	done: "Done",
};

/** Progress only stops at these values (percent). */
export const PROGRESS_STEPS = [0, 25, 50, 75, 100] as const;

export interface SelectOption {
	id: string;
	name: string;
	tone: Tone;
	/** Only on status options. */
	group?: StatusGroup;
}

export interface DbColumn {
	id: string;
	name: string;
	type: ColumnType;
	/** Width in px; left out means the default width. */
	width?: number;
	/** Only on select, multi-select and status columns. */
	options?: SelectOption[];
}

export type CellValue = string | number | boolean | string[] | null;
export type Cells = Record<string, CellValue>;

export interface DbSort {
	column: string;
	dir: "asc" | "desc";
}

/** The id of the one title column every database has. */
export const TITLE_ID = "title";
export const MIN_WIDTH = 80;
export const MAX_WIDTH = 640;
export const DEFAULT_WIDTH = 160;

/** The columns a database has if its file names none. Never mutated. */
export const FALLBACK_COLUMNS: readonly DbColumn[] = Object.freeze([
	Object.freeze({ id: TITLE_ID, name: "Name", type: "title" as const }),
]);

/** A short id for a column or an option, unique within its database. */
export function newShortId(taken: Iterable<string> = []): string {
	const used = new Set(taken);
	let id = crypto.randomUUID().slice(0, 8);
	while (used.has(id)) id = crypto.randomUUID().slice(0, 8);
	return id;
}

/** The columns a new database starts with: Name and Tags, like Notion. */
export function starterColumns(): DbColumn[] {
	return [
		{ id: TITLE_ID, name: "Name", type: "title" },
		{
			id: newShortId([TITLE_ID]),
			name: "Tags",
			type: "multiSelect",
			options: [],
		},
	];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * The `noteId` of the note a row was turned into (see `linkRowToNote`), or
 * null. Anything else read from a file is no link, so a bad value can't crash
 * the view.
 */
export function normalizeNoteId(value: unknown): string | null {
	return typeof value === "string" && value !== "" ? value : null;
}

const isColumnType = (value: unknown): value is ColumnType =>
	COLUMN_TYPES.includes(value as ColumnType);

const isTone = (value: unknown): value is Tone => TONES.includes(value as Tone);

const isGroup = (value: unknown): value is StatusGroup =>
	STATUS_GROUPS.includes(value as StatusGroup);

/** Whether a column keeps a list of options. */
export const hasOptions = (type: ColumnType): boolean =>
	type === "select" || type === "multiSelect" || type === "status";

/** The options a new status column starts with, like Notion's. */
export function starterStatusOptions(): SelectOption[] {
	const ids: string[] = [];
	const make = (name: string, tone: Tone, group: StatusGroup) => {
		const id = newShortId(ids);
		ids.push(id);
		return { id, name, tone, group };
	};
	return [
		make("Not started", "gray", "todo"),
		make("In progress", "blue", "doing"),
		make("Done", "green", "done"),
	];
}

/** The progress step nearest to a number (anything unreadable is 0). */
export function snapProgress(value: number): number {
	if (!Number.isFinite(value)) return 0;
	let best: number = PROGRESS_STEPS[0];
	for (const step of PROGRESS_STEPS) {
		if (Math.abs(step - value) < Math.abs(best - value)) best = step;
	}
	return best;
}

function normalizeOptions(value: unknown, status = false): SelectOption[] {
	if (!Array.isArray(value)) return [];
	const seen = new Set<string>();
	const out: SelectOption[] = [];
	for (const raw of value) {
		if (!isRecord(raw)) continue;
		const { id, name, tone } = raw;
		if (typeof id !== "string" || id === "" || seen.has(id)) continue;
		if (typeof name !== "string") continue;
		seen.add(id);
		const option: SelectOption = {
			id,
			name,
			tone: isTone(tone) ? tone : "gray",
		};
		if (status) option.group = isGroup(raw.group) ? raw.group : "todo";
		out.push(option);
	}
	return out;
}

/**
 * Readable columns from whatever the file holds: bad entries and repeated ids
 * are dropped, and the result always starts with exactly one title column.
 */
export function normalizeColumns(value: unknown): DbColumn[] {
	const out: DbColumn[] = [];
	const seen = new Set<string>();
	let title: DbColumn | null = null;
	for (const raw of Array.isArray(value) ? value : []) {
		if (!isRecord(raw)) continue;
		const { id, name, type, width, options } = raw;
		if (typeof id !== "string" || id === "" || seen.has(id)) continue;
		if (!isColumnType(type)) continue;
		seen.add(id);
		const column: DbColumn = {
			id,
			name: typeof name === "string" ? name : "",
			type,
		};
		if (typeof width === "number" && Number.isFinite(width)) {
			column.width = clampWidth(width);
		}
		if (hasOptions(type)) {
			column.options = normalizeOptions(options, type === "status");
		}
		if (type === "title") {
			if (title === null) title = column;
			continue;
		}
		out.push(column);
	}
	return [title ?? { id: TITLE_ID, name: "Name", type: "title" }, ...out];
}

export function normalizeSort(
	value: unknown,
	columns: readonly DbColumn[],
): DbSort | null {
	if (!isRecord(value)) return null;
	const { column, dir } = value;
	if (typeof column !== "string") return null;
	if (!columns.some((c) => c.id === column)) return null;
	return { column, dir: dir === "desc" ? "desc" : "asc" };
}

export function normalizeCells(value: unknown): Cells {
	if (!isRecord(value)) return {};
	const out: Cells = {};
	for (const [key, raw] of Object.entries(value)) {
		if (
			raw === null ||
			typeof raw === "string" ||
			typeof raw === "boolean" ||
			(typeof raw === "number" && Number.isFinite(raw))
		) {
			out[key] = raw;
		} else if (Array.isArray(raw)) {
			out[key] = raw.filter((v): v is string => typeof v === "string");
		}
	}
	return out;
}

export function clampWidth(width: number): number {
	return Math.round(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, width)));
}

/** A cell's value, read as the column's type expects (anything else is empty). */
export function readCell(cells: Cells, column: DbColumn): CellValue {
	const value = cells[column.id];
	switch (column.type) {
		case "title":
		case "text":
		case "url":
		case "date":
			return typeof value === "string" ? value : null;
		case "number":
			return typeof value === "number" ? value : null;
		case "checkbox":
			return value === true;
		case "select":
		case "status":
			return typeof value === "string" &&
				column.options?.some((o) => o.id === value)
				? value
				: null;
		case "progress":
			return typeof value === "number" ? snapProgress(value) : null;
		case "multiSelect": {
			if (!Array.isArray(value)) return [];
			const known = new Set(column.options?.map((o) => o.id));
			return value.filter((id) => known.has(id));
		}
	}
}

/** A cell as plain text, for sorting, copying and the hover preview. */
export function cellText(cells: Cells, column: DbColumn): string {
	const value = readCell(cells, column);
	const optionName = (id: string) =>
		column.options?.find((o) => o.id === id)?.name ?? "";
	switch (column.type) {
		case "checkbox":
			return value === true ? "Yes" : "No";
		case "select":
		case "status":
			return typeof value === "string" ? optionName(value) : "";
		case "progress":
			return typeof value === "number" ? `${value}%` : "";
		case "multiSelect":
			return Array.isArray(value) ? value.map(optionName).join(", ") : "";
		case "number":
			return typeof value === "number" ? String(value) : "";
		default:
			return typeof value === "string" ? value : "";
	}
}

/** The next option colour: the first tone the column doesn't use yet. */
function nextTone(options: readonly SelectOption[]): Tone {
	const used = new Set(options.map((o) => o.tone));
	return (
		TONES.find((t) => t !== "gray" && !used.has(t)) ??
		TONES[options.length % TONES.length] ??
		"gray"
	);
}

/**
 * The column with an option of this name (case-insensitive match reuses the
 * existing one) and that option's id. The column passed in is not changed.
 */
export function ensureOption(
	column: DbColumn,
	name: string,
): { column: DbColumn; optionId: string } {
	const options = column.options ?? [];
	const wanted = name.trim();
	const existing = options.find(
		(o) => o.name.toLowerCase() === wanted.toLowerCase(),
	);
	if (existing) return { column, optionId: existing.id };
	const option: SelectOption = {
		id: newShortId(options.map((o) => o.id)),
		name: wanted,
		tone: nextTone(options),
	};
	if (column.type === "status") option.group = "todo";
	return {
		column: { ...column, options: [...options, option] },
		optionId: option.id,
	};
}

/**
 * A column changed to another type, with each row's value carried over where
 * it can be: text that reads as a number becomes that number, option names
 * become text, text becomes options (created as needed), and so on. Values
 * that make no sense in the new type are cleared. Returns the new column and
 * the new value for each row, in the order given.
 */
export function convertColumn(
	column: DbColumn,
	type: ColumnType,
	rows: readonly Cells[],
): { column: DbColumn; values: CellValue[] } {
	if (type === column.type || type === "title" || column.type === "title") {
		return { column, values: rows.map((cells) => readCell(cells, column)) };
	}
	let next: DbColumn = { id: column.id, name: column.name, type };
	if (column.width !== undefined) next.width = column.width;
	if (hasOptions(type)) {
		// Keep the old options when moving between the option types; status
		// options need a group, select options don't carry one.
		next.options = (column.options ?? []).map((o) => {
			const { group: _group, ...rest } = o;
			return type === "status" ? { ...rest, group: o.group ?? "todo" } : rest;
		});
		if (type === "status" && next.options.length === 0) {
			next.options = starterStatusOptions();
		}
	}
	const values: CellValue[] = [];
	for (const cells of rows) {
		const text = cellText(cells, column).trim();
		const old = readCell(cells, column);
		switch (type) {
			case "text":
			case "url":
				values.push(text === "" ? null : text);
				break;
			case "number": {
				const n = Number(text);
				values.push(text !== "" && Number.isFinite(n) ? n : null);
				break;
			}
			case "checkbox":
				values.push(
					old === true ||
						["yes", "true", "1", "x"].includes(text.toLowerCase()),
				);
				break;
			case "date":
				values.push(/^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null);
				break;
			case "progress": {
				const n = Number.parseFloat(text.replace("%", ""));
				values.push(text !== "" && Number.isFinite(n) ? snapProgress(n) : null);
				break;
			}
			case "status":
			case "select": {
				if (column.type === "multiSelect" && Array.isArray(old)) {
					values.push(old[0] ?? null);
					break;
				}
				if (text === "") {
					values.push(null);
					break;
				}
				const made = ensureOption(next, text);
				next = made.column;
				values.push(made.optionId);
				break;
			}
			case "multiSelect": {
				if (column.type === "select" || column.type === "status") {
					values.push(typeof old === "string" ? [old] : []);
					break;
				}
				const ids: string[] = [];
				for (const part of text.split(",")) {
					if (part.trim() === "") continue;
					const made = ensureOption(next, part);
					next = made.column;
					if (!ids.includes(made.optionId)) ids.push(made.optionId);
				}
				values.push(ids);
				break;
			}
		}
	}
	return { column: next, values };
}

/** Whether a value counts as empty (empty values sort last either way). */
function isEmpty(value: CellValue): boolean {
	return (
		value === null ||
		value === "" ||
		(Array.isArray(value) && value.length === 0)
	);
}

/**
 * The order rows are shown in: file order with no sort, otherwise by the
 * sort column, empty cells last, ties kept in file order. Returns indices.
 */
export function sortedOrder(
	rows: readonly Cells[],
	columns: readonly DbColumn[],
	sort: DbSort | null,
): number[] {
	const order = rows.map((_, i) => i);
	const column = sort ? columns.find((c) => c.id === sort.column) : undefined;
	if (!sort || !column) return order;
	const sign = sort.dir === "desc" ? -1 : 1;
	const key = (cells: Cells): string | number | boolean | null => {
		const value = readCell(cells, column);
		if (isEmpty(value)) return null;
		if (column.type === "number" || column.type === "progress")
			return value as number;
		if (column.type === "status") {
			// By group (to do, in progress, done), then the option's place.
			const options = column.options ?? [];
			const option = options.find((o) => o.id === value);
			const group = STATUS_GROUPS.indexOf(option?.group ?? "todo");
			return group * 1000 + options.findIndex((o) => o.id === value);
		}
		if (column.type === "checkbox") return value === true;
		if (column.type === "select" || column.type === "multiSelect") {
			// Options sort in the order they appear in the column, like Notion.
			const ids = Array.isArray(value) ? value : [value as string];
			const index = column.options?.findIndex((o) => o.id === ids[0]) ?? -1;
			return index;
		}
		return cellText(cells, column).toLowerCase();
	};
	const keys = rows.map(key);
	return order.sort((a, b) => {
		const ka = keys[a] ?? null;
		const kb = keys[b] ?? null;
		if (ka === null && kb === null) return a - b;
		if (ka === null) return 1;
		if (kb === null) return -1;
		let cmp = 0;
		if (typeof ka === "string" && typeof kb === "string") {
			cmp = ka.localeCompare(kb, undefined, { numeric: true });
		} else {
			cmp = Number(ka) - Number(kb);
		}
		return cmp !== 0 ? cmp * sign : a - b;
	});
}
