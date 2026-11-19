import type { Block, JsonValue, Note } from "../note-format";
import {
	addProperty,
	type Change,
	cleanName,
	defaultValue,
	findName,
	isPropertyType,
	type PropertyType,
	type PropertyValue,
	type Props,
	readProps,
	setOptions,
	setValue,
} from "./properties";
import { type FillTemplateOptions, fillTemplate } from "./template-prompts";

/**
 * The form block's settings (the `formBlock` attrs). In "fill" mode the fields
 * edit this note's own properties and nothing is copied into the block; in
 * "create" mode a Create button makes a new note from `template` in `folder`.
 */
export type FormMode = "fill" | "create";

export interface FormField {
	/** The property this field fills; it is made with `type` when missing. */
	name: string;
	type: PropertyType;
	/** Shown instead of the name. */
	label?: string;
}

export interface FormConfig {
	mode: FormMode;
	fields: FormField[];
	/** Create mode: the template's label (path inside the templates folder), "" for a blank note. */
	template: string;
	/** Create mode: a vault folder, "" for where new notes normally go. */
	folder: string;
}

export const MAX_FORM_FIELDS = 30;

/** A folder path as stored; anything that could leave the vault becomes "". */
function cleanFolder(value: unknown): string {
	if (typeof value !== "string") return "";
	const parts = value.split("/").filter((part) => part.trim() !== "");
	return parts.some((part) => part === "." || part === "..")
		? ""
		: parts.join("/");
}

/** Read the attrs of a form block, repairing anything unreadable without throwing. */
export function normalizeForm(attrs: Record<string, unknown>): FormConfig {
	const fields: FormField[] = [];
	const seen = new Set<string>();
	if (Array.isArray(attrs.fields)) {
		for (const raw of attrs.fields) {
			if (fields.length >= MAX_FORM_FIELDS) break;
			if (typeof raw !== "object" || raw === null) continue;
			const entry = raw as Record<string, unknown>;
			const name = typeof entry.name === "string" ? cleanName(entry.name) : "";
			if (name === "" || seen.has(name.toLowerCase())) continue;
			seen.add(name.toLowerCase());
			const type =
				name.toLowerCase() === "tags"
					? "list"
					: isPropertyType(entry.type)
						? entry.type
						: "text";
			const label = typeof entry.label === "string" ? entry.label.trim() : "";
			fields.push({ name, type, ...(label ? { label } : {}) });
		}
	}
	return {
		mode: attrs.mode === "create" ? "create" : "fill",
		fields,
		template: typeof attrs.template === "string" ? attrs.template : "",
		folder: cleanFolder(attrs.folder),
	};
}

/** What a fill-mode field shows for the note's current properties. */
export type FieldView =
	| {
			kind: "value";
			type: PropertyType;
			value: PropertyValue;
			/** Select only: the property's choices. */
			options: string[];
	  }
	/** The property exists in a form this version can't edit; it is left alone. */
	| { kind: "kept" };

/**
 * The property's own type and value decide the control (a renamed or retyped
 * property elsewhere never rewrites it); a missing one shows empty and is made
 * with the field's type on first edit.
 */
export function fieldView(props: Props, field: FormField): FieldView {
	const key = findName(props, field.name);
	if (key === null)
		return {
			kind: "value",
			type: field.type,
			value: defaultValue(field.type),
			options: [],
		};
	const item = readProps(props).find((candidate) => candidate.name === key);
	if (!item?.known) return { kind: "kept" };
	return {
		kind: "value",
		type: item.type,
		value: item.value,
		options: item.options ?? [],
	};
}

/** Write one answer into the note's properties, adding the property first when missing. */
export function applyAnswer(
	props: Props,
	field: FormField,
	value: PropertyValue,
): Change {
	let next = props;
	let key = findName(props, field.name);
	if (key === null) {
		const made = addProperty(props, field.name, field.type);
		if (!made.ok) return made;
		next = made.props;
		key = cleanName(field.name);
	}
	const set = setValue(next, key, value);
	if (!set.ok) return set;
	// A select with no choices yet takes a typed answer as its first choice.
	const item = readProps(set.props).find((candidate) => candidate.name === key);
	if (
		item?.known &&
		item.type === "select" &&
		typeof value === "string" &&
		value !== "" &&
		!(item.options ?? []).includes(value)
	)
		return setOptions(set.props, key, [...(item.options ?? []), value]);
	return set;
}

export type Answers = Record<string, PropertyValue>;

/** Whether an answer says nothing (a checkbox always does). */
export function isBlank(value: PropertyValue | undefined): boolean {
	return (
		value === undefined ||
		value === null ||
		value === "" ||
		(Array.isArray(value) && value.length === 0)
	);
}

/** Answers as properties of a new note; blank ones are left out, checkboxes always kept. */
export function answersToProps(
	fields: readonly FormField[],
	answers: Answers,
): Props {
	const props: Props = {};
	for (const field of fields) {
		const value = answers[field.name];
		if (field.type === "checkbox") {
			props[field.name] = { type: "checkbox", value: value === true };
		} else if (!isBlank(value)) {
			props[field.name] =
				field.type === "select"
					? {
							type: "select",
							value: value as string,
							options: [value as string],
						}
					: { type: field.type, value: value as JsonValue };
		}
	}
	return props;
}

/** The new note's title: a field called Title or Name, else the first text answer. */
export function titleFromAnswers(
	fields: readonly FormField[],
	answers: Answers,
): string {
	const text = (field: FormField | undefined) => {
		const value = field ? answers[field.name] : undefined;
		return typeof value === "string" ? value.trim() : "";
	};
	const named = fields.find((f) =>
		["title", "name"].includes(f.name.toLowerCase()),
	);
	return (
		text(named) ||
		text(fields.find((f) => f.type === "text" && text(f) !== "")) ||
		""
	);
}

/**
 * The new note for a submitted create form: the template filled in (a prompt
 * with the same label as a field takes its answer), then the answers as
 * properties on top. The template itself is not touched.
 */
export function buildFormNote(options: {
	template: Note | null;
	fields: readonly FormField[];
	answers: Answers;
	fallbackTitle: string;
	now?: Date;
	formats?: FillTemplateOptions["formats"];
	weekStartsOn?: FillTemplateOptions["weekStartsOn"];
}): { title: string; blocks: Block[] | undefined; props: Props } {
	const { template, fields, answers } = options;
	const answered = titleFromAnswers(fields, answers);
	const filled = template
		? fillTemplate(template, answered || options.fallbackTitle, {
				answers,
				now: options.now,
				formats: options.formats,
				weekStartsOn: options.weekStartsOn,
			})
		: null;
	const usesPattern =
		typeof template?.header.titleTemplate === "string" &&
		(filled?.title.trim() ?? "") !== "";
	const title =
		(usesPattern ? filled?.title.trim() : "") ||
		answered ||
		filled?.title.trim() ||
		options.fallbackTitle;
	const props: Props = { ...(filled?.props ?? {}) };
	for (const [name, entry] of Object.entries(answersToProps(fields, answers))) {
		const old = findName(props, name);
		if (old !== null) delete props[old];
		props[name] = entry;
	}
	return { title, blocks: filled?.blocks, props };
}
