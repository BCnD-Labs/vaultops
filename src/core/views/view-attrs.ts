import {
	normalizeGroup,
	normalizeRule,
	normalizeSort,
	propName,
	type Rule,
	type SortKey,
} from "./rule";

/** The view format this build writes and fully understands. */
export const VIEW_VERSION = 1;
export const DEFAULT_LIMIT = 200;

/** Layouts the picker lists. Only the table is built; the others fall back to it. */
export const LAYOUTS = ["table", "board", "gallery", "calendar"] as const;
export type Layout = (typeof LAYOUTS)[number];
export const BUILT_LAYOUTS: readonly Layout[] = ["table"];

/** A liveView block's attrs as this build reads them (decision D1 A). */
export interface ViewSettings {
	title: string;
	rule: Rule;
	sort: SortKey[];
	layout: Layout;
	/** `tag`, `type`, a `prop:` field, or null for no groups. */
	group: string | null;
	/** `title` first, then `type` or `prop:` fields, no repeats. */
	columns: string[];
	limit: number;
	/** Written by a newer build: shown, but not evaluated with rules it may not mean. */
	newer: boolean;
}

/**
 * Visible columns; the title always comes first, since clicking it opens the
 * note. Properties match ignoring capitals, so `prop:author` repeats `prop:Author`.
 */
export function normalizeColumns(raw: unknown): string[] {
	const out = ["title"];
	if (!Array.isArray(raw)) return out;
	const seen = new Set(out);
	for (const item of raw) {
		const name = propName(item);
		const field = item === "type" ? item : name ? `prop:${name}` : null;
		if (!field || seen.has(field.toLowerCase())) continue;
		seen.add(field.toLowerCase());
		out.push(field);
	}
	return out;
}

export function normalizeLimit(raw: unknown): number {
	return Number.isInteger(raw) && (raw as number) > 0
		? Math.min(raw as number, 10000)
		: DEFAULT_LIMIT;
}

export function readViewSettings(attrs: Record<string, unknown>): ViewSettings {
	return {
		title: typeof attrs.title === "string" ? attrs.title : "",
		rule: normalizeRule(attrs.rule),
		sort: normalizeSort(attrs.sort),
		layout: LAYOUTS.find((l) => l === attrs.layout) ?? "table",
		group: normalizeGroup(attrs.group),
		columns: normalizeColumns(attrs.columns),
		limit: normalizeLimit(attrs.limit),
		newer: typeof attrs.v === "number" && attrs.v > VIEW_VERSION,
	};
}

/** What `/view` inserts: a table of the notes in the host note's own folder. */
export function newViewAttrs(hostPath: string | null): Record<string, unknown> {
	const cut = hostPath ? hostPath.lastIndexOf("/") : -1;
	const folder = hostPath && cut !== -1 ? hostPath.slice(0, cut) : "";
	return {
		v: VIEW_VERSION,
		layout: "table",
		rule: {
			match: "all",
			conditions: [{ field: "folder", op: "in", value: folder, sub: false }],
		},
		sort: [{ field: "title", dir: "asc" }],
		columns: ["title", "prop:tags"],
	};
}
