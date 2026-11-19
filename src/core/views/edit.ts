import type { PropertyType } from "../notes/properties";
import type { MatchRow } from "./match";
import { type PropOp, propName } from "./rule";

/** What the Edit view menus offer, read from the vault's rows. */
export interface ViewChoices {
	/** Every folder that holds a note (and its parents), sorted. */
	folders: string[];
	/** Every tag, with the parents of nested tags, sorted. */
	tags: string[];
	/** Type ids in use. */
	types: string[];
	/** Properties by first-seen spelling, with their type and every option seen. */
	props: { name: string; type: PropertyType; options: string[] }[];
	notes: { id: string; title: string }[];
}

const sorted = (set: Set<string>) =>
	[...set].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

export function viewChoices(rows: readonly MatchRow[]): ViewChoices {
	const folders = new Set<string>();
	const tags = new Set<string>();
	const types = new Set<string>();
	const props = new Map<string, ViewChoices["props"][number]>();
	const notes: ViewChoices["notes"] = [];
	for (const row of rows) {
		if (row.path.startsWith(".vaultops/")) continue;
		for (let cut = row.path.lastIndexOf("/"); cut > 0; ) {
			folders.add(row.path.slice(0, cut));
			cut = row.path.lastIndexOf("/", cut - 1);
		}
		for (const tag of row.tags) {
			const parts = tag.split("/");
			for (let i = 1; i <= parts.length; i++)
				tags.add(parts.slice(0, i).join("/"));
		}
		if (row.type) types.add(row.type);
		if (row.id && row.kind !== "canvas")
			notes.push({ id: row.id, title: row.title || "Untitled" });
		for (const [key, f] of Object.entries(row.fields)) {
			const seen = props.get(key) ?? {
				name: f.name,
				type: f.type,
				options: [],
			};
			const extra = Array.isArray(f.value)
				? f.value
				: typeof f.value === "string" && f.value !== ""
					? [f.value]
					: [];
			for (const o of [...(f.options ?? []), ...extra])
				if (!seen.options.includes(o)) seen.options.push(o);
			props.set(key, seen);
		}
	}
	return {
		folders: sorted(folders),
		tags: sorted(tags),
		types: sorted(types),
		props: [...props.values()].sort((a, b) => a.name.localeCompare(b.name)),
		notes: notes.sort((a, b) => a.title.localeCompare(b.title)),
	};
}

/** The properties some note has, by lower-cased name (the rest are "missing"). */
export const knownProps = (choices: ViewChoices) =>
	new Set(choices.props.map((p) => p.name.toLowerCase()));

/** A condition on a property no note has: it shows "Property missing" and matches nothing. */
export function isMissing(
	c: { field: unknown },
	known: ReadonlySet<string>,
): boolean {
	const name = propName(c.field);
	return name !== null && !known.has(name.toLowerCase());
}

export interface OpChoice {
	op: PropOp;
	label: string;
	/** What the value box is: none, text, number, a date, one option or several. */
	input: "none" | "text" | "number" | "date" | "option" | "options";
	/** Set for "is checked" (true) and "is not checked" (false). */
	value?: boolean;
}

const EMPTY: OpChoice[] = [
	{ op: "empty", label: "is empty", input: "none" },
	{ op: "notEmpty", label: "is not empty", input: "none" },
];

/** The operators each property type supports (those the core matches). */
export function opsFor(type: PropertyType | undefined): OpChoice[] {
	switch (type) {
		case "number":
			return [
				{ op: "is", label: "is", input: "number" },
				{ op: "lt", label: "is less than", input: "number" },
				{ op: "gt", label: "is more than", input: "number" },
				...EMPTY,
			];
		case "date":
			return [
				{ op: "before", label: "is before", input: "date" },
				{ op: "after", label: "is after", input: "date" },
				{ op: "today", label: "is today", input: "none" },
				{ op: "thisWeek", label: "is this week", input: "none" },
				{ op: "nextDays", label: "is in the next days", input: "number" },
				...EMPTY,
			];
		case "checkbox":
			return [
				{ op: "checked", label: "is checked", input: "none", value: true },
				{ op: "checked", label: "is not checked", input: "none", value: false },
			];
		case "select":
			return [
				{ op: "is", label: "is", input: "option" },
				{ op: "oneOf", label: "is one of", input: "options" },
				...EMPTY,
			];
		case "list":
			return [{ op: "contains", label: "contains", input: "option" }, ...EMPTY];
		default:
			return [
				{ op: "contains", label: "contains", input: "text" },
				{ op: "is", label: "is", input: "text" },
				...EMPTY,
			];
	}
}

/** The menu key of a stored condition: which field row it is (tag "not" is its own entry). */
export function fieldKey(c: Record<string, unknown>): string {
	if (c.field === "tag") return c.op === "not" ? "tag:not" : "tag:has";
	if (c.field === "linked") return `linked:${String(c.op)}`;
	return String(c.field);
}

/** A fresh condition for a menu key, filled with the first sensible value. */
export function newCondition(
	key: string,
	choices: ViewChoices,
): Record<string, unknown> {
	switch (key) {
		case "folder":
			return { field: "folder", op: "in", value: "", sub: true };
		case "tag:has":
		case "tag:not":
			return {
				field: "tag",
				op: key === "tag:not" ? "not" : "has",
				value: choices.tags[0] ?? "tag",
				sub: true,
			};
		case "type":
			return { field: "type", op: "is", value: [choices.types[0] ?? ""] };
		case "linked:to":
		case "linked:from":
			return {
				field: "linked",
				op: key === "linked:from" ? "from" : "to",
				value: choices.notes[0]?.id ?? "",
			};
		default: {
			const name = propName(key) ?? "";
			const prop = choices.props.find(
				(p) => p.name.toLowerCase() === name.toLowerCase(),
			);
			// Start on an operator that needs no value, so the condition is complete.
			const first = opsFor(prop?.type).find((o) => o.input === "none");
			return { field: `prop:${name}`, op: first?.op ?? "empty" };
		}
	}
}

/**
 * A property condition switched to another operator, with a starting value for
 * inputs that have one. Text has none: the condition stays incomplete (and is
 * ignored) until something is typed, so the stored list keeps its place.
 */
export function changeOp(
	c: Record<string, unknown>,
	choice: OpChoice,
	options: readonly string[],
	today: string,
): Record<string, unknown> {
	const { value: _old, ...rest } = c;
	const first = options[0];
	const value =
		choice.value !== undefined
			? choice.value
			: choice.input === "number"
				? choice.op === "nextDays"
					? 7
					: 0
				: choice.input === "date"
					? today
					: choice.input === "option"
						? first
						: choice.input === "options"
							? first === undefined
								? undefined
								: [first]
							: undefined;
	return { ...rest, op: choice.op, ...(value === undefined ? {} : { value }) };
}

/** The menu key of an operator choice; "checked" needs its value to tell apart. */
export function opKey(op: unknown, value: unknown): string {
	return op === "checked" ? `checked:${value !== false}` : String(op);
}

export function opChoiceKey(c: OpChoice): string {
	return opKey(c.op, c.value);
}

/** The property condition's value for an operator's input, from what was typed. */
export function propConditionValue(
	input: OpChoice["input"],
	raw: string,
): string | number | string[] | undefined {
	switch (input) {
		case "number": {
			const n = Number(raw);
			return raw.trim() !== "" && Number.isFinite(n) ? n : undefined;
		}
		case "options": {
			const list = raw
				.split(",")
				.map((s) => s.trim())
				.filter(Boolean);
			return list.length > 0 ? list : undefined;
		}
		case "none":
			return undefined;
		default:
			return raw.trim() === "" ? undefined : raw.trim();
	}
}
