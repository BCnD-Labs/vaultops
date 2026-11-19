import { cleanName } from "../notes/properties";
import { cleanTag } from "../notes/tags";
import { validDateKey } from "../planner/dates";

/**
 * A live view's rule, stored in the liveView block's attrs (decision D1 A):
 *
 *   "rule": { "match": "all", "conditions": [
 *     { "field": "type", "op": "is", "value": ["book"] },
 *     { "field": "tag", "op": "has", "value": "reading", "sub": true },
 *     { "field": "prop:Status", "op": "is", "value": "Reading" } ] }
 *
 * The normalizers below turn whatever is stored into this shape and drop any
 * condition they can't read, so a hand-edited or newer block is harmless.
 */

export type PropOp =
	| "contains"
	| "is"
	| "oneOf"
	| "empty"
	| "notEmpty"
	| "lt"
	| "gt"
	| "before"
	| "after"
	| "today"
	| "thisWeek"
	| "nextDays"
	| "checked";

/** `prop:<Name>` names a property; matched ignoring capitals. */
export type PropField = `prop:${string}`;

export type Condition =
	| { field: "folder"; op: "in"; value: string; sub: boolean }
	| { field: "tag"; op: "has" | "not"; value: string; sub: boolean }
	| { field: "type"; op: "is"; value: string[] }
	| { field: "linked"; op: "to" | "from"; value: string }
	| {
			field: PropField;
			op: PropOp;
			value?: string | number | boolean | string[];
	  };

export interface Rule {
	match: "all" | "any";
	conditions: Condition[];
}

export interface SortKey {
	/** `title`, `type` or a `prop:` field. */
	field: string;
	dir: "asc" | "desc";
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj =>
	typeof v === "object" && v !== null && !Array.isArray(v);
const strings = (v: unknown): string[] | null =>
	Array.isArray(v) && v.every((s) => typeof s === "string") ? v : null;

/** The property name in a `prop:` field, cleaned; null when it isn't one. */
export function propName(field: unknown): string | null {
	if (typeof field !== "string" || !field.startsWith("prop:")) return null;
	const name = cleanName(field.slice(5));
	return name === "" ? null : name;
}

const NO_VALUE: PropOp[] = ["empty", "notEmpty", "today", "thisWeek"];

function propValue(op: unknown, value: unknown): Condition["value"] | null {
	switch (op) {
		case "contains":
			return typeof value === "string" && value.trim() !== ""
				? value.trim()
				: null;
		case "is":
			return typeof value === "string" ||
				typeof value === "boolean" ||
				(typeof value === "number" && Number.isFinite(value))
				? value
				: null;
		case "oneOf": {
			const list = strings(value);
			return list && list.length > 0 ? list : null;
		}
		case "lt":
		case "gt":
			return typeof value === "number" && Number.isFinite(value) ? value : null;
		case "before":
		case "after":
			return validDateKey(value) ? value : null;
		case "nextDays":
			return Number.isInteger(value) && (value as number) > 0
				? (value as number)
				: null;
		case "checked":
			return value === undefined
				? true
				: typeof value === "boolean"
					? value
					: null;
		default:
			return null;
	}
}

/** One stored condition, or null when it can't be read. */
export function normalizeCondition(raw: unknown): Condition | null {
	if (!isObj(raw)) return null;
	const { field, op, value } = raw;
	const sub = raw.sub !== false;
	if (field === "folder" && op === "in" && typeof value === "string") {
		const folder = value.replace(/^\/+|\/+$/g, "");
		if (folder.split("/").includes("..")) return null;
		return { field, op, value: folder, sub };
	}
	if (field === "tag" && (op === "has" || op === "not")) {
		const tag = typeof value === "string" ? cleanTag(value) : null;
		return tag === null ? null : { field, op, value: tag, sub };
	}
	if (field === "type" && op === "is") {
		const ids = strings(value)?.filter((id) => id !== "");
		return ids && ids.length > 0 ? { field, op, value: ids } : null;
	}
	if (field === "linked" && (op === "to" || op === "from")) {
		return typeof value === "string" && value !== ""
			? { field, op, value }
			: null;
	}
	const name = propName(field);
	if (name === null || typeof op !== "string") return null;
	if (NO_VALUE.includes(op as PropOp)) {
		return { field: `prop:${name}`, op: op as PropOp };
	}
	const v = propValue(op, value);
	return v === null
		? null
		: { field: `prop:${name}`, op: op as PropOp, value: v };
}

/** A stored rule; no rule (or an unreadable one) is "all of nothing", every note. */
export function normalizeRule(raw: unknown): Rule {
	if (!isObj(raw)) return { match: "all", conditions: [] };
	const conditions = Array.isArray(raw.conditions)
		? raw.conditions
				.map(normalizeCondition)
				.filter((c): c is Condition => c !== null)
		: [];
	return { match: raw.match === "any" ? "any" : "all", conditions };
}

function sortField(field: unknown): string | null {
	if (field === "title" || field === "type") return field;
	const name = propName(field);
	return name === null ? null : `prop:${name}`;
}

/** Up to two sort keys; bad or repeated ones are dropped. */
export function normalizeSort(raw: unknown): SortKey[] {
	if (!Array.isArray(raw)) return [];
	const out: SortKey[] = [];
	for (const item of raw) {
		if (!isObj(item)) continue;
		const field = sortField(item.field);
		if (field === null || out.some((k) => k.field === field)) continue;
		out.push({ field, dir: item.dir === "desc" ? "desc" : "asc" });
		if (out.length === 2) break;
	}
	return out;
}

/** The group-by field (`tag`, `type` or a `prop:` field), or null for none. */
export function normalizeGroup(raw: unknown): string | null {
	if (raw === "tag" || raw === "type") return raw;
	const name = propName(raw);
	return name === null ? null : `prop:${name}`;
}
