import type { Block, JsonValue, Note } from "../note-format";
import {
	defaultValue,
	findName,
	isPropertyType,
	type PropertyType,
	type PropertyValue,
} from "./properties";
import { formatTemplateDate, templateDateKey } from "./template-dates";
import { blocksFromTemplate, type PlaceholderFormats } from "./templates";

export interface TemplatePrompt {
	label: string;
	type: PropertyType;
	options: string[];
	default: PropertyValue;
}

type Declaration = { prompt: TemplatePrompt; explicit: boolean };
const marker = /\{\{(\?[^{}]+|prompt:[^{}]+)\}\}/g;
const object = (v: JsonValue | undefined): v is { [key: string]: JsonValue } =>
	v !== null && typeof v === "object" && !Array.isArray(v);

function typed(
	type: PropertyType,
	value: PropertyValue,
	now: Date,
	week: 0 | 1,
): PropertyValue {
	if (value === null || value === "") return defaultValue(type);
	switch (type) {
		case "text":
			return typeof value === "string" ? value : String(value);
		case "select":
			return typeof value === "string" ? value : String(value);
		case "number": {
			const n = Number(value);
			return Number.isFinite(n) ? n : null;
		}
		case "checkbox":
			return (
				value === true ||
				(typeof value === "string" &&
					["true", "yes", "1"].includes(value.toLowerCase()))
			);
		case "list":
			return (Array.isArray(value) ? value : String(value).split(","))
				.map((s) => s.trim())
				.filter(Boolean);
		case "date":
			return typeof value === "string"
				? (templateDateKey(value, now, week) ??
						(formatTemplateDate(value, "YYYY-MM-DD") ? value : null))
				: null;
	}
}

function declaration(
	inner: string,
	now: Date,
	week: 0 | 1,
): Declaration | null {
	const short = inner.startsWith("?");
	const parts = (short ? inner.slice(1) : inner.slice(7))
		.split("|")
		.map((s) => s.trim());
	const label = parts[0] ?? "";
	const rawType = parts[1] || "text";
	if (
		!label ||
		!isPropertyType(rawType) ||
		parts.length > (rawType === "select" ? 4 : 3)
	)
		return null;
	const options =
		rawType === "select"
			? (parts[2] ?? "")
					.split(",")
					.map((s) => s.trim())
					.filter(Boolean)
			: [];
	const rawDefault = rawType === "select" ? parts[3] : parts[2];
	return {
		prompt: {
			label,
			type: rawType,
			options,
			default:
				rawDefault === undefined
					? rawType === "checkbox"
						? null
						: defaultValue(rawType)
					: typed(rawType, rawDefault, now, week),
		},
		explicit: !short && Boolean(parts[1]),
	};
}

function visitText(
	value: JsonValue | undefined,
	visit: (text: string) => void,
): void {
	if (Array.isArray(value)) for (const item of value) visitText(item, visit);
	else if (object(value))
		for (const [key, inner] of Object.entries(value)) {
			if (key === "text" && typeof inner === "string") visit(inner);
			else visitText(inner, visit);
		}
}

/** Find declarations in block text, property values and the title pattern. */
export function extractPrompts(
	template: Note,
	now = new Date(),
	weekStartsOn: 0 | 1 = 0,
): TemplatePrompt[] {
	const found = new Map<string, Declaration>();
	const scan = (text: string) => {
		for (const match of text.matchAll(marker)) {
			const d = declaration(match[1] ?? "", now, weekStartsOn);
			if (!d) continue;
			const key = d.prompt.label.toLowerCase();
			const old = found.get(key);
			if (!old || (!old.explicit && d.explicit)) found.set(key, d);
		}
	};
	for (const block of template.blocks) visitText(block as JsonValue, scan);
	if (object(template.header.props))
		for (const entry of Object.values(template.header.props)) {
			if (object(entry) && typeof entry.value === "string") scan(entry.value);
		}
	if (typeof template.header.titleTemplate === "string")
		scan(template.header.titleTemplate);
	return [...found.values()].map((d) => d.prompt);
}

export interface FillTemplateOptions {
	answers?: Record<string, PropertyValue>;
	selection?: string;
	now?: Date;
	formats?: PlaceholderFormats;
	weekStartsOn?: 0 | 1;
}

/** Fill a template without changing it; the cursor offset is in block text. */
export function fillTemplate(
	template: Note,
	title: string,
	options: FillTemplateOptions = {},
): {
	blocks: Block[];
	props: { [key: string]: JsonValue };
	title: string;
	cursor: { blockId: string; offset: number } | null;
} {
	const now = options.now ?? new Date();
	const week = options.weekStartsOn ?? 0;
	const prompts = extractPrompts(template, now, week);
	const answers = options.answers ?? {};
	const values = new Map(
		prompts.map((p) => {
			const name = findName(answers, p.label);
			return [
				p.label.toLowerCase(),
				typed(
					p.type,
					name === null ? p.default : (answers[name] ?? null),
					now,
					week,
				),
			] as const;
		}),
	);
	const render = (text: string, onCursor?: (offset: number) => void) => {
		let delta = 0;
		return text.replace(
			/\{\{(\?[^{}]+|prompt:[^{}]+|selection|cursor)\}\}/g,
			(whole, inner: string, at: number) => {
				let replacement = whole;
				if (inner === "cursor") {
					onCursor?.(at + delta);
					replacement = "";
				} else if (inner === "selection") replacement = options.selection ?? "";
				else {
					const d = declaration(inner, now, week);
					if (d) {
						const prompt = prompts.find(
							(p) => p.label.toLowerCase() === d.prompt.label.toLowerCase(),
						);
						const value = values.get(d.prompt.label.toLowerCase());
						if (
							value == null ||
							(prompt?.default === null &&
								findName(answers, prompt.label) === null)
						)
							replacement = "";
						else if (Array.isArray(value)) replacement = value.join(", ");
						else if (typeof value === "boolean")
							replacement = value ? "Yes" : "No";
						else if (prompt?.type === "date" && typeof value === "string")
							replacement =
								formatTemplateDate(
									value,
									options.formats?.date ?? "YYYY-MM-DD",
								) ?? value;
						else replacement = String(value);
					}
				}
				delta += replacement.length - whole.length;
				return replacement;
			},
		);
	};
	const blocks = blocksFromTemplate(
		template,
		title,
		now,
		options.formats,
		week,
	);
	let cursor: { blockId: string; offset: number } | null = null;
	for (const block of blocks) {
		let offset = 0;
		const walk = (value: JsonValue | undefined): void => {
			if (Array.isArray(value)) for (const item of value) walk(item);
			else if (object(value))
				for (const [key, inner] of Object.entries(value)) {
					if (key === "text" && typeof inner === "string") {
						const text = render(inner, (at) => {
							if (!cursor && block.id)
								cursor = { blockId: block.id, offset: offset + at };
						});
						value[key] = text;
						offset += text.length;
					} else walk(inner);
				}
		};
		walk(block as JsonValue);
		if (Array.isArray(block.content))
			block.content = block.content.filter(
				(item) => !object(item) || item.type !== "text" || item.text !== "",
			);
	}
	const props = object(template.header.props)
		? { ...template.header.props }
		: {};
	for (const [name, entry] of Object.entries(props)) {
		if (!object(entry)) continue;
		const match =
			typeof entry.value === "string"
				? /^\{\{(\?[^{}]+|prompt:[^{}]+)\}\}$/.exec(entry.value)
				: null;
		const declared = match ? declaration(match[1] ?? "", now, week) : null;
		const prompt = prompts.find(
			(p) =>
				p.label.toLowerCase() ===
				(declared?.prompt.label ?? name).toLowerCase(),
		);
		if (prompt && (declared || entry.type === prompt.type))
			props[name] = {
				...entry,
				type: prompt.type,
				...(prompt.type === "select" && declared
					? { options: prompt.options }
					: {}),
				value: values.get(prompt.label.toLowerCase()) ?? null,
			};
	}
	let resultTitle = title;
	if (typeof template.header.titleTemplate === "string") {
		const temp: Note = {
			header: template.header,
			blocks: [
				{
					type: "paragraph",
					parent: null,
					content: [{ text: template.header.titleTemplate }],
				},
			],
		};
		const filled = blocksFromTemplate(
			temp,
			title,
			now,
			options.formats,
			week,
		)[0]?.content;
		if (
			Array.isArray(filled) &&
			object(filled[0]) &&
			typeof filled[0].text === "string"
		)
			resultTitle = render(filled[0].text);
	}
	return { blocks, props, title: resultTitle, cursor };
}
