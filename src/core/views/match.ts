import { addDaysToKey, startOfWeekKey } from "../planner/dates";
import { RESOURCES } from "../resources/resources";
import type { ViewField, ViewFields } from "./row";
import { type Condition, propName, type Rule } from "./rule";

/** The parts of a note row a rule reads. */
export interface MatchRow extends ViewFields {
	path: string;
	id?: string;
	title: string;
	kind?: "note" | "canvas";
	tags: string[];
	links?: string[];
}

export interface MatchContext {
	/** Today as `YYYY-MM-DD` (nothing here reads the clock). */
	today: string;
	weekStartsOn?: 0 | 1;
	/** The note that holds the view; it never lists itself. */
	hostPath?: string;
	/** The `noteId`s a note links to, for "linked from". */
	linksOf?: (noteId: string) => readonly string[] | undefined;
	/**
	 * The lower-cased names of properties some note has. A condition on any other
	 * property is "missing" and matches nothing. Left out, every name counts.
	 */
	knownProps?: ReadonlySet<string>;
}

type Test = (row: MatchRow) => boolean;

/** Resource cards: hidden notes that only a Type condition brings in. */
const CARDS = `${RESOURCES}/cards/`;

const lower = (s: string) => s.toLowerCase();

function isEmpty(field: ViewField | undefined): boolean {
	if (!field) return true;
	const v = field.value;
	return v === null || v === "" || (Array.isArray(v) && v.length === 0);
}

/** Text items of a field for text-like tests (text, select, list). */
function texts(field: ViewField): string[] | null {
	const v = field.value;
	if (field.type === "list" && Array.isArray(v)) return v.map(lower);
	if (
		(field.type === "text" || field.type === "select") &&
		typeof v === "string"
	)
		return [lower(v)];
	return null;
}

function dateOf(field: ViewField | undefined): string | null {
	return field?.type === "date" && typeof field.value === "string"
		? field.value
		: null;
}

function propTest(c: Condition, ctx: MatchContext): Test {
	const key = lower(propName(c.field) ?? "");
	if (ctx.knownProps && !ctx.knownProps.has(key)) return () => false;
	const get = (row: MatchRow) => row.fields[key];
	const v = c.value;
	const between =
		(from: string, to: string): Test =>
		(row) => {
			const d = dateOf(get(row));
			return d !== null && d >= from && d <= to;
		};
	switch (c.op) {
		case "empty":
			return (row) => get(row)?.type !== "checkbox" && isEmpty(get(row));
		case "notEmpty":
			return (row) => get(row)?.type !== "checkbox" && !isEmpty(get(row));
		case "contains": {
			const want = lower(String(v));
			return (row) => {
				const f = get(row);
				const items = f && texts(f);
				if (!items) return false;
				return f.type === "list"
					? items.includes(want)
					: items.some((t) => t.includes(want));
			};
		}
		case "is":
		case "oneOf": {
			const wants = (Array.isArray(v) ? v : [v]).map((w) => lower(String(w)));
			return (row) => {
				const f = get(row);
				if (!f || f.value === null) return false;
				if (f.type === "number" || f.type === "checkbox" || f.type === "date")
					return wants.includes(lower(String(f.value)));
				return (texts(f) ?? []).some((t) => wants.includes(t));
			};
		}
		case "lt":
		case "gt":
			return (row) => {
				const n = get(row)?.value;
				if (get(row)?.type !== "number" || typeof n !== "number") return false;
				return c.op === "lt" ? n < (v as number) : n > (v as number);
			};
		case "before":
			return (row) => (dateOf(get(row)) ?? "9999") < (v as string);
		case "after":
			return (row) => (dateOf(get(row)) ?? "") > (v as string);
		case "today":
			return between(ctx.today, ctx.today);
		case "thisWeek": {
			const start = startOfWeekKey(ctx.today, ctx.weekStartsOn ?? 0);
			return between(start, addDaysToKey(start, 6));
		}
		case "nextDays":
			return between(ctx.today, addDaysToKey(ctx.today, v as number));
		case "checked":
			return (row) => {
				const f = get(row);
				const on = f?.type === "checkbox" && f.value === true;
				return on === (v !== false);
			};
		default:
			return () => false;
	}
}

function conditionTest(c: Condition, ctx: MatchContext): Test {
	switch (c.field) {
		case "folder": {
			const dir = c.value;
			const prefix = `${dir}/`;
			if (dir === "")
				return c.sub ? () => true : (row) => !row.path.includes("/");
			return c.sub
				? (row) => row.path.startsWith(prefix)
				: (row) => row.path.slice(0, row.path.lastIndexOf("/")) === dir;
		}
		case "tag": {
			const want = lower(c.value);
			const below = `${want}/`;
			const has: Test = (row) =>
				row.tags.some((tag) => {
					const t = lower(tag);
					return t === want || (c.sub && t.startsWith(below));
				});
			return c.op === "has" ? has : (row) => !has(row);
		}
		case "type": {
			const ids = new Set(c.value);
			return (row) => row.type !== undefined && ids.has(row.type);
		}
		case "linked": {
			const target = c.value;
			if (c.op === "to") return (row) => row.links?.includes(target) ?? false;
			const from = new Set(ctx.linksOf?.(target) ?? []);
			return (row) => row.id !== undefined && from.has(row.id);
		}
		default:
			return propTest(c, ctx);
	}
}

/**
 * The rule as one predicate, built once per view. Nothing else in `.vaultops/`
 * (trash, templates) ever shows; hidden cards and canvases only show when the
 * rule asks for a Type, and the host note never shows.
 */
export function compileRule(rule: Rule, ctx: MatchContext): Test {
	const tests = rule.conditions.map((c) => conditionTest(c, ctx));
	const byType = rule.conditions.some((c) => c.field === "type");
	const passes: Test =
		tests.length === 0
			? () => true
			: rule.match === "all"
				? (row) => tests.every((t) => t(row))
				: (row) => tests.some((t) => t(row));
	const hidden = (path: string) =>
		path.startsWith(".vaultops/") && !(byType && path.startsWith(CARDS));
	return (row) =>
		row.path !== ctx.hostPath &&
		(byType || row.kind !== "canvas") &&
		!hidden(row.path) &&
		passes(row);
}
