import type { Host } from "../../host/host";
import { fileNameFor, NOTE_EXT } from "../file-name/file-name";
import {
	type Block,
	describeSaveProblems,
	type JsonValue,
	NOTE_FORMAT,
	NOTE_FORMAT_VERSION,
	type Note,
	type NoteHeader,
	parseNote,
	prepareSave,
} from "../note-format";
import {
	cleanName,
	findName,
	fits,
	headerProps,
	type Props,
	withProps,
} from "../notes/properties";
import { copyToRecovery, moveToRecovery } from "../notes/trash";

/**
 * Resources: contacts, books, articles and anything the user defines. Kept
 * outside the Notes tree, in `.vaultops/resources/`:
 *
 *   types.json          the resource types (name, title label, ordered fields)
 *   cards/<name>.vnote  one ordinary note file per card
 *
 * A card's values are the note's own header `props` (ADR-0002), keyed by the
 * field's label, so search, links and git history keep working. The card's
 * type is `resource.type` in the header. A value whose field was removed (or
 * whose type was deleted) stays in `props` and shows as an extra property;
 * nothing is dropped unless the user asks, and then a copy goes to the
 * recovery folder first.
 */
export const RESOURCES = ".vaultops/resources";
export const TYPES_FILE = `${RESOURCES}/types.json`;
export const CARDS = `${RESOURCES}/cards`;
export const TYPES_FORMAT = "vaultops-resource-types";
export const TYPES_VERSION = 1;

export const FIELD_KINDS = ["text", "long", "date", "link", "number"] as const;
export type FieldKind = (typeof FIELD_KINDS)[number];

export const KIND_LABELS: Record<FieldKind, string> = {
	text: "Text",
	long: "Long text",
	date: "Date",
	link: "Link",
	number: "Number",
};

export interface ResourceField {
	/** Shown to the user and used as the property name on cards. Unique per type. */
	label: string;
	kind: FieldKind;
	required: boolean;
}

export interface ResourceType {
	id: string;
	name: string;
	/** What the card's own name is called: "Name", "Title". Always required. */
	titleLabel: string;
	fields: ResourceField[];
}

const field = (label: string, kind: FieldKind = "text"): ResourceField => ({
	label,
	kind,
	required: false,
});

/** The types a vault starts with, used until the first change is saved. */
export const DEFAULT_TYPES: readonly ResourceType[] = [
	{
		id: "contact",
		name: "Contact",
		titleLabel: "Name",
		fields: [
			field("Role"),
			field("Organization"),
			field("Email"),
			field("Phone"),
			field("Where we met"),
			field("Birthday", "date"),
			field("Notes", "long"),
		],
	},
	{
		id: "book",
		name: "Book",
		titleLabel: "Title",
		fields: [
			field("Author"),
			field("Year", "number"),
			field("Status"),
			field("Notes", "long"),
		],
	},
	{
		id: "article",
		name: "Article",
		titleLabel: "Title",
		fields: [
			field("Author"),
			field("Source"),
			field("Link", "link"),
			field("Published", "date"),
			field("Notes", "long"),
		],
	},
];

const sameName = (a: string, b: string) =>
	cleanName(a).toLowerCase() === cleanName(b).toLowerCase();

// ---------------------------------------------------------------- types ----

function parseField(raw: unknown): ResourceField | null {
	if (typeof raw !== "object" || raw === null) return null;
	const f = raw as Record<string, unknown>;
	if (typeof f.label !== "string" || cleanName(f.label) === "") return null;
	if (!(FIELD_KINDS as readonly unknown[]).includes(f.kind)) return null;
	if (typeof f.required !== "boolean") return null;
	return { label: f.label, kind: f.kind as FieldKind, required: f.required };
}

function parseTypes(data: unknown): ResourceType[] {
	const bad = new Error(
		"The resource types file could not be read, so resources are read-only until it is fixed.",
	);
	if (typeof data !== "object" || data === null) throw bad;
	const d = data as Record<string, unknown>;
	if (d.format !== TYPES_FORMAT || typeof d.v !== "number") throw bad;
	if (d.v > TYPES_VERSION) {
		throw new Error(
			"The resource types were written by a newer app version, so they are read-only here.",
		);
	}
	if (!Array.isArray(d.types)) throw bad;
	const ids = new Set<string>();
	const types: ResourceType[] = [];
	for (const raw of d.types) {
		if (typeof raw !== "object" || raw === null) throw bad;
		const t = raw as Record<string, unknown>;
		if (
			typeof t.id !== "string" ||
			t.id === "" ||
			ids.has(t.id) ||
			typeof t.name !== "string" ||
			cleanName(t.name) === "" ||
			typeof t.titleLabel !== "string" ||
			cleanName(t.titleLabel) === "" ||
			!Array.isArray(t.fields)
		) {
			throw bad;
		}
		ids.add(t.id);
		const fields: ResourceField[] = [];
		for (const rawField of t.fields) {
			const f = parseField(rawField);
			if (!f || fields.some((x) => sameName(x.label, f.label))) throw bad;
			fields.push(f);
		}
		types.push({ id: t.id, name: t.name, titleLabel: t.titleLabel, fields });
	}
	return types;
}

/**
 * The resource types: what is saved, or the built-in ones before anything is.
 * A types file that can't be read throws and is never overwritten.
 */
export async function loadTypes(host: Host): Promise<ResourceType[]> {
	if ((await host.kindOf(TYPES_FILE)) !== "file") {
		return structuredClone(DEFAULT_TYPES) as ResourceType[];
	}
	const text = await host.readText(TYPES_FILE);
	let data: unknown;
	try {
		data = JSON.parse(text);
	} catch {
		data = null;
	}
	return parseTypes(data);
}

async function saveTypes(host: Host, types: ResourceType[]): Promise<void> {
	await host.makeFolder(RESOURCES);
	const body = { format: TYPES_FORMAT, v: TYPES_VERSION, types };
	await host.writeTextAtomic(TYPES_FILE, `${JSON.stringify(body, null, 2)}\n`);
}

const slug = (name: string) =>
	name
		.normalize("NFKD")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "") || "type";

export type TypesResult =
	| { ok: true; types: ResourceType[]; id?: string }
	| { ok: false; message: string };

/** Add a type with a name, a title label and optional starter fields. */
export async function addType(
	host: Host,
	input: { name: string; titleLabel: string; fields?: ResourceField[] },
): Promise<TypesResult> {
	const name = cleanName(input.name);
	const titleLabel = cleanName(input.titleLabel) || "Name";
	if (name === "") return { ok: false, message: "Name the type." };
	const types = await loadTypes(host);
	if (types.some((t) => sameName(t.name, name))) {
		return { ok: false, message: `A type called ${name} already exists.` };
	}
	const fields: ResourceField[] = [];
	for (const f of input.fields ?? []) {
		const label = cleanName(f.label);
		if (
			label === "" ||
			sameName(label, titleLabel) ||
			fields.some((x) => sameName(x.label, label))
		) {
			continue;
		}
		fields.push({ label, kind: f.kind, required: f.required });
	}
	let id = slug(name);
	for (let n = 2; types.some((t) => t.id === id); n++)
		id = `${slug(name)}-${n}`;
	const next = [...types, { id, name, titleLabel, fields }];
	await saveTypes(host, next);
	return { ok: true, types: next, id };
}

/** Add a field to a type. Existing cards simply show it empty. */
export async function addField(
	host: Host,
	typeId: string,
	input: ResourceField,
): Promise<TypesResult> {
	const label = cleanName(input.label);
	if (label === "") return { ok: false, message: "Name the field." };
	const types = await loadTypes(host);
	const type = types.find((t) => t.id === typeId);
	if (!type) return { ok: false, message: "That type was not found." };
	if (
		sameName(label, type.titleLabel) ||
		type.fields.some((f) => sameName(f.label, label))
	) {
		return {
			ok: false,
			message: `${type.name} already has a field called ${label}.`,
		};
	}
	const next = types.map((t) =>
		t.id === typeId ? { ...t, fields: [...t.fields, { ...input, label }] } : t,
	);
	await saveTypes(host, next);
	return { ok: true, types: next };
}

/**
 * Make a field required or optional. Cards saved earlier are not touched; they
 * are flagged where they are shown.
 */
export async function setFieldRequired(
	host: Host,
	typeId: string,
	label: string,
	required: boolean,
): Promise<ResourceType[]> {
	const types = await loadTypes(host);
	const next = types.map((t) =>
		t.id === typeId
			? {
					...t,
					fields: t.fields.map((f) =>
						f.label === label ? { ...f, required } : f,
					),
				}
			: t,
	);
	await saveTypes(host, next);
	return next;
}

// ---------------------------------------------------------------- cards ----

export interface ResourceCard {
	path: string;
	title: string;
	/** The type's id, or null for a card with no type (or an unknown one). */
	typeId: string | null;
	noteId: string;
	/** ISO time of the last change made here, "" when unknown. */
	updated: string;
	header: NoteHeader;
	blocks: Block[];
	props: Props;
	/** Why the file can't be used, when it can't. Such a card is never edited. */
	problem?: string;
}

const stem = (file: string) =>
	file.toLowerCase().endsWith(NOTE_EXT)
		? file.slice(0, file.length - NOTE_EXT.length)
		: file;

const baseOf = (path: string) => path.slice(path.lastIndexOf("/") + 1);

function resourceOf(header: NoteHeader): Record<string, JsonValue> {
	const raw = header.resource;
	return typeof raw === "object" && raw !== null && !Array.isArray(raw)
		? raw
		: {};
}

function readCard(path: string, text: string): ResourceCard {
	const parsed = parseNote(text);
	const base = baseOf(path);
	if (!parsed.note || parsed.problems.some((p) => p.kind === "newer-version")) {
		return {
			path,
			title: stem(base),
			typeId: null,
			noteId: "",
			updated: "",
			header: {} as NoteHeader,
			blocks: [],
			props: {},
			problem: "This card could not be read, so it can't be edited here.",
		};
	}
	const { header, blocks } = parsed.note;
	const res = resourceOf(header);
	return {
		path,
		title: typeof header.title === "string" ? header.title : stem(base),
		typeId: typeof res.type === "string" ? res.type : null,
		noteId: header.noteId,
		updated: typeof res.updated === "string" ? res.updated : "",
		header,
		blocks,
		props: headerProps(header) ?? {},
	};
}

/** Every card, sorted by title. A file that can't be read is listed with a problem. */
export async function listCards(host: Host): Promise<ResourceCard[]> {
	if ((await host.kindOf(CARDS)) !== "folder") return [];
	const cards: ResourceCard[] = [];
	for (const entry of await host.list(CARDS)) {
		if (entry.kind !== "file" || !entry.name.toLowerCase().endsWith(NOTE_EXT)) {
			continue;
		}
		const path = `${CARDS}/${entry.name}`;
		try {
			cards.push(readCard(path, await host.readText(path)));
		} catch {
			cards.push({
				...readCard(path, ""),
				problem: "This card could not be read, so it can't be edited here.",
			});
		}
	}
	return cards.sort((a, b) =>
		a.title.localeCompare(b.title, undefined, { sensitivity: "base" }),
	);
}

type Text = string;

/** What a stored property looks like as text, or null if this version can't show it. */
export function valueText(entry: JsonValue | undefined): Text | null {
	if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
		return null;
	}
	const v = entry.value;
	if (typeof v === "string") return v;
	if (typeof v === "number") return String(v);
	if (typeof v === "boolean") return v ? "Yes" : "No";
	if (Array.isArray(v) && v.every((x) => typeof x === "string")) {
		return (v as string[]).join(", ");
	}
	return v === null ? "" : null;
}

export interface FieldValue {
	field: ResourceField;
	value: string;
}

/** The values of a card for its type's fields, in the type's order. */
export function cardFields(
	card: ResourceCard,
	type: ResourceType,
): FieldValue[] {
	return type.fields.map((f) => {
		const key = findName(card.props, f.label);
		return { field: f, value: key ? (valueText(card.props[key]) ?? "") : "" };
	});
}

export interface ExtraValue {
	name: string;
	/** Null when the property is of a kind this version can't show; it is kept as is. */
	value: string | null;
}

/** Properties on a card that no field of its type shows: kept, never dropped. */
export function cardExtras(
	card: ResourceCard,
	type: ResourceType | null,
): ExtraValue[] {
	return Object.entries(card.props)
		.filter(([name]) => !type?.fields.some((f) => sameName(f.label, name)))
		.map(([name, entry]) => ({ name, value: valueText(entry) }));
}

/** Labels of required fields (and the title) that have no value. */
export function missingRequired(
	card: ResourceCard,
	type: ResourceType | null,
): string[] {
	if (!type) return [];
	const out: string[] = [];
	if (card.title.trim() === "") out.push(type.titleLabel);
	for (const { field: f, value } of cardFields(card, type)) {
		if (f.required && value.trim() === "") out.push(f.label);
	}
	return out;
}

/** How many of the type's fields (the title included) have a value. */
export function completeness(
	card: ResourceCard,
	type: ResourceType,
): { filled: number; total: number } {
	const filled =
		(card.title.trim() === "" ? 0 : 1) +
		cardFields(card, type).filter((v) => v.value.trim() !== "").length;
	return { filled, total: 1 + type.fields.length };
}

function entryFor(
	kind: FieldKind,
	text: string,
): { ok: true; entry: JsonValue } | { ok: false; message: string } {
	if (kind === "number") {
		const n = Number(text);
		if (text === "" || !Number.isFinite(n)) {
			return { ok: false, message: "must be a number" };
		}
		return { ok: true, entry: { type: "number", value: n } };
	}
	if (kind === "date") {
		if (!fits("date", text)) return { ok: false, message: "must be a date" };
		return { ok: true, entry: { type: "date", value: text } };
	}
	return { ok: true, entry: { type: "text", value: text } };
}

/**
 * Apply form values (keyed by field label) onto a card's props. A blank value
 * clears that property; properties the form doesn't mention are kept as they are.
 */
export function applyValues(
	props: Props,
	type: ResourceType,
	values: Record<string, string>,
): { ok: true; props: Props } | { ok: false; message: string } {
	let next: Props = { ...props };
	for (const f of type.fields) {
		if (!(f.label in values)) continue;
		const text = (values[f.label] ?? "").trim();
		const key = findName(next, f.label);
		if (text === "") {
			if (key) {
				const { [key]: _gone, ...rest } = next;
				next = rest;
			}
			continue;
		}
		const made = entryFor(f.kind, text);
		if (!made.ok) return { ok: false, message: `${f.label} ${made.message}.` };
		const old = key ? next[key] : undefined;
		const keepRest =
			typeof old === "object" &&
			old !== null &&
			!Array.isArray(old) &&
			typeof made.entry === "object" &&
			made.entry !== null &&
			!Array.isArray(made.entry) &&
			old.type === made.entry.type
				? old
				: {};
		next = {
			...next,
			[key ?? f.label]: { ...keepRest, ...(made.entry as object) } as JsonValue,
		};
	}
	return { ok: true, props: next };
}

export type CardResult =
	| { ok: true; path: string }
	| { ok: false; message: string };

function checkRequired(
	type: ResourceType,
	title: string,
	values: Record<string, string>,
): string | null {
	const missing: string[] = [];
	if (title.trim() === "") missing.push(type.titleLabel);
	for (const f of type.fields) {
		if (f.required && (values[f.label] ?? "").trim() === "") {
			missing.push(f.label);
		}
	}
	return missing.length > 0 ? `Needs: ${missing.join(", ")}.` : null;
}

/** Create a card of a type. Only the title and required fields must be filled. */
export async function createCard(
	host: Host,
	type: ResourceType,
	title: string,
	values: Record<string, string>,
	now: Date = new Date(),
): Promise<CardResult> {
	const name = title.trim();
	const missing = checkRequired(type, name, values);
	if (missing) return { ok: false, message: missing };
	const applied = applyValues({}, type, values);
	if (!applied.ok) return applied;
	const note: Note = {
		header: withProps(
			{
				format: NOTE_FORMAT,
				v: NOTE_FORMAT_VERSION,
				noteId: crypto.randomUUID(),
				title: name,
				resource: { type: type.id, updated: now.toISOString() },
			},
			applied.props,
		),
		blocks: [{ id: crypto.randomUUID(), type: "paragraph", parent: null }],
	};
	const check = prepareSave(note);
	if (!check.ok) {
		return {
			ok: false,
			message: `This card can't be saved:\n${describeSaveProblems(check.problems)}`,
		};
	}
	await host.makeFolder(CARDS);
	const taken = (await host.list(CARDS)).map((e) => e.name);
	const path = `${CARDS}/${fileNameFor(name, taken)}`;
	await host.writeTextAtomic(path, check.text);
	return { ok: true, path };
}

async function readEditable(host: Host, path: string): Promise<ResourceCard> {
	if (!path.startsWith(`${CARDS}/`) || (await host.kindOf(path)) !== "file") {
		throw new Error("That card was not found.");
	}
	const card = readCard(path, await host.readText(path));
	if (card.problem) throw new Error(card.problem);
	return card;
}

async function writeCard(
	host: Host,
	card: ResourceCard,
	header: NoteHeader,
): Promise<void> {
	const check = prepareSave({ header, blocks: card.blocks });
	if (!check.ok) {
		throw new Error(
			`This card can't be saved:\n${describeSaveProblems(check.problems)}`,
		);
	}
	await host.writeTextAtomic(card.path, check.text);
}

/** Save the form for an existing card. Values for fields the form doesn't send stay. */
export async function updateCard(
	host: Host,
	path: string,
	type: ResourceType,
	title: string,
	values: Record<string, string>,
	now: Date = new Date(),
): Promise<CardResult> {
	const name = title.trim();
	const missing = checkRequired(type, name, values);
	if (missing) return { ok: false, message: missing };
	const card = await readEditable(host, path);
	const applied = applyValues(card.props, type, values);
	if (!applied.ok) return applied;
	const header = withProps(
		{
			...card.header,
			title: name,
			resource: {
				...resourceOf(card.header),
				type: type.id,
				updated: now.toISOString(),
			},
		},
		applied.props,
	);
	await writeCard(host, card, header);
	return { ok: true, path };
}

/**
 * Give a card another type, or none (null). Its properties are not touched:
 * the ones the new type has a field for show there, the rest show as extras.
 */
export async function setCardType(
	host: Host,
	path: string,
	typeId: string | null,
	now: Date = new Date(),
): Promise<void> {
	const card = await readEditable(host, path);
	const { type: _old, ...rest } = resourceOf(card.header);
	const resource: Record<string, JsonValue> =
		typeId === null
			? rest
			: { ...rest, type: typeId, updated: now.toISOString() };
	const { resource: _r, ...others } = card.header as Record<string, JsonValue>;
	const header = (
		Object.keys(resource).length > 0 ? { ...others, resource } : others
	) as NoteHeader;
	await writeCard(host, card, header);
}

/** Move a card to the recovery folder. Nothing is erased. */
export async function removeCard(
	host: Host,
	path: string,
	now: Date = new Date(),
): Promise<void> {
	if (!path.startsWith(`${CARDS}/`) || (await host.kindOf(path)) !== "file") {
		throw new Error("That card was not found.");
	}
	await moveToRecovery(host, path, `resources/cards/${baseOf(path)}`, now);
}

// ------------------------------------------------------- guided removal ----

/** How many cards of a type have a value in a field. */
export async function countValues(
	host: Host,
	typeId: string,
	label: string,
): Promise<{ cards: number; withValue: number }> {
	const cards = (await listCards(host)).filter((c) => c.typeId === typeId);
	const withValue = cards.filter((c) => {
		const key = findName(c.props, label);
		return key !== null && (valueText(c.props[key]) ?? "x") !== "";
	}).length;
	return { cards: cards.length, withValue };
}

/**
 * Take a field off a type. By default the values stay on the cards as extra
 * properties. With `alsoValues`, each card's old file is first copied to the
 * recovery folder, then the value is removed. The type changes first, so an
 * interruption can only leave values behind, never lose one.
 */
export async function removeField(
	host: Host,
	typeId: string,
	label: string,
	options: { alsoValues?: boolean; now?: Date } = {},
): Promise<{ types: ResourceType[]; removedValues: number }> {
	const types = await loadTypes(host);
	const type = types.find((t) => t.id === typeId);
	if (!type?.fields.some((f) => f.label === label)) {
		throw new Error("That field was not found.");
	}
	const next = types.map((t) =>
		t.id === typeId
			? { ...t, fields: t.fields.filter((f) => f.label !== label) }
			: t,
	);
	await saveTypes(host, next);
	let removedValues = 0;
	if (options.alsoValues) {
		const now = options.now ?? new Date();
		for (const card of await listCards(host)) {
			if (card.typeId !== typeId || card.problem) continue;
			const key = findName(card.props, label);
			if (key === null) continue;
			await copyToRecovery(
				host,
				await host.readText(card.path),
				`resources/cards/${baseOf(card.path)}`,
				now,
			);
			const { [key]: _gone, ...rest } = card.props;
			await writeCard(host, card, withProps(card.header, rest));
			removedValues++;
		}
	}
	return { types: next, removedValues };
}

/**
 * Delete a type. Its cards stay: they become typeless (every value kept as an
 * extra property) or move to `moveTo`. The old types file is copied to the
 * recovery folder first.
 */
export async function deleteType(
	host: Host,
	typeId: string,
	options: { moveTo?: string | null; now?: Date } = {},
): Promise<{ types: ResourceType[]; cards: number }> {
	const types = await loadTypes(host);
	if (!types.some((t) => t.id === typeId)) {
		throw new Error("That type was not found.");
	}
	const target = options.moveTo ?? null;
	if (
		target !== null &&
		(target === typeId || !types.some((t) => t.id === target))
	) {
		throw new Error("Choose another type to move the cards to.");
	}
	const now = options.now ?? new Date();
	await copyToRecovery(
		host,
		`${JSON.stringify({ format: TYPES_FORMAT, v: TYPES_VERSION, types }, null, 2)}\n`,
		"resources/types.json",
		now,
	);
	let moved = 0;
	for (const card of await listCards(host)) {
		if (card.typeId !== typeId || card.problem) continue;
		await setCardType(host, card.path, target, now);
		moved++;
	}
	const next = types.filter((t) => t.id !== typeId);
	await saveTypes(host, next);
	return { types: next, cards: moved };
}

/** Cards whose title or any value contains every word of `query`. */
export function searchCards(
	cards: ResourceCard[],
	query: string,
): ResourceCard[] {
	const words = query.toLowerCase().split(/\s+/).filter(Boolean);
	if (words.length === 0) return cards;
	return cards.filter((card) => {
		const hay = [
			card.title,
			...Object.entries(card.props).flatMap(([name, entry]) => [
				name,
				valueText(entry) ?? "",
			]),
		]
			.join(" ")
			.toLowerCase();
		return words.every((w) => hay.includes(w));
	});
}
