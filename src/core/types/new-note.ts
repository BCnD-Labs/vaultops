import {
	type JsonValue,
	NOTE_FORMAT,
	NOTE_FORMAT_VERSION,
	type Note,
	type NoteHeader,
} from "../note-format";
import {
	cleanName,
	defaultValue,
	headerProps,
	type PropertyItem,
	type PropertyValue,
	setValue,
	withProps,
} from "../notes/properties";
import type { TemplatePrompt } from "../notes/template-prompts";
import type { TemplateEntry } from "../notes/templates";
import type { ResourceType } from "../resources/resources";
import { applyType, propertyTypeOf } from "./apply";

/** The questions a new note of this type asks: one per field, like a smart template's prompts. */
export function fieldPrompts(type: ResourceType): TemplatePrompt[] {
	return type.fields.map((f) => {
		const propType = propertyTypeOf(f.kind);
		return {
			label: f.label,
			type: propType,
			options: propType === "select" ? [...(f.options ?? [])] : [],
			default: defaultValue(propType),
		};
	});
}

/** The template a type points at (a path or name under `.vaultops/templates`), if it exists and can be read. */
export function findTypeTemplate(
	templates: TemplateEntry[],
	ref: string,
): TemplateEntry | null {
	const norm = (s: string) =>
		s.replace(/^\.vaultops\/templates\//, "").replace(/\.vnote$/i, "");
	return (
		templates.find((t) => t.note && norm(t.path) === norm(ref.trim())) ?? null
	);
}

/** What a type without a template starts from: one empty paragraph. */
export function blankTemplate(): Note {
	return {
		header: { format: NOTE_FORMAT, v: NOTE_FORMAT_VERSION, noteId: "" },
		blocks: [{ id: crypto.randomUUID(), type: "paragraph", parent: null }],
	};
}

/**
 * The header of a new note of a type: the filled template's properties, the
 * type's missing fields as empty typed properties, the answers to the field
 * questions on top, and `resource.type`.
 */
export function typedHeader(
	type: ResourceType,
	templateProps: { [key: string]: JsonValue },
	answers: Record<string, PropertyValue> = {},
): { ok: true; header: NoteHeader } | { ok: false; message: string } {
	const base = {
		format: NOTE_FORMAT,
		v: NOTE_FORMAT_VERSION,
		noteId: "",
		props: templateProps,
	} as NoteHeader;
	const applied = applyType(base, type);
	if (!applied.ok) return applied;
	let props = headerProps(applied.header) ?? {};
	for (const f of type.fields) {
		if (!Object.hasOwn(answers, f.label)) continue;
		const change = setValue(props, f.label, answers[f.label] ?? null);
		if (change.ok) props = change.props;
	}
	return { ok: true, header: withProps(applied.header, props) };
}

const sameName = (a: string, b: string) =>
	cleanName(a).toLowerCase() === cleanName(b).toLowerCase();

/**
 * Order a note's properties for its type: the type's fields first, in the
 * type's order, then the rest. A field whose property has another type is
 * listed in `mismatched` ("doesn't match the type").
 */
export function groupByType(
	items: PropertyItem[],
	type: ResourceType | undefined,
): { items: PropertyItem[]; fieldCount: number; mismatched: Set<string> } {
	const mismatched = new Set<string>();
	if (!type) return { items, fieldCount: 0, mismatched };
	const first: PropertyItem[] = [];
	for (const f of type.fields) {
		const item = items.find(
			(i) => !first.includes(i) && sameName(i.name, f.label),
		);
		if (!item) continue;
		first.push(item);
		if (!item.known || item.type !== propertyTypeOf(f.kind))
			mismatched.add(item.name);
	}
	return {
		items: [...first, ...items.filter((i) => !first.includes(i))],
		fieldCount: first.length,
		mismatched,
	};
}
