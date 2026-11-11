import type { Host } from "../../host/host";
import { fileNameFor, NOTE_EXT, safeName } from "../file-name/file-name";
import {
	type Block,
	describeSaveProblems,
	type JsonValue,
	type Note,
	parseNote,
	prepareSave,
} from "../note-format";
import { nameKey } from "../vault-path/vault-path";
import { previewOf } from "./scan";
import { moveToRecovery } from "./trash";

/** Where templates live: ordinary note files, hidden from the tree and search. */
export const TEMPLATES = ".vaultops/templates";

export interface TemplateEntry {
	/** The template's name (the file name without `.vnote`). */
	name: string;
	/** The folder inside the templates folder, "" at the top. */
	folder: string;
	/** Name with its folders, e.g. `School/Lecture Notes`. */
	label: string;
	/** Vault-relative path to the template file. */
	path: string;
	/** The template itself, or null when the file could not be read as a note. */
	note: Note | null;
	/** Plain text of the first blocks, for the card. */
	preview: string;
	/** Why the file could not be used, when `note` is null. */
	problem?: string;
}

export interface TemplateFolder {
	name: string;
	/** Path from the templates folder, e.g. `School/Year 2`. */
	label: string;
	/** Vault-relative path to the folder. */
	path: string;
}

export interface TemplateList {
	folders: TemplateFolder[];
	templates: TemplateEntry[];
}

const stem = (file: string) =>
	file.toLowerCase().endsWith(NOTE_EXT)
		? file.slice(0, file.length - NOTE_EXT.length)
		: file;

const byLabel = (a: { label: string }, b: { label: string }) =>
	a.label.localeCompare(b.label, undefined, { sensitivity: "base" });

const inside = (path: string) => path.startsWith(`${TEMPLATES}/`);
const relOf = (path: string) => path.slice(TEMPLATES.length + 1);
const join = (folder: string, name: string) =>
	folder === "" ? name : `${folder}/${name}`;
const dirOf = (folder: string) =>
	folder === "" ? TEMPLATES : `${TEMPLATES}/${folder}`;
const parentOf = (path: string) =>
	path.slice(0, Math.max(0, path.lastIndexOf("/")));
const baseOf = (path: string) => path.slice(path.lastIndexOf("/") + 1);

async function readEntry(
	host: Host,
	path: string,
	folder: string,
): Promise<TemplateEntry> {
	const name = stem(baseOf(path));
	const base = { name, folder, label: join(folder, name), path };
	let parsed: ReturnType<typeof parseNote> | null = null;
	try {
		parsed = parseNote(await host.readText(path));
	} catch {
		parsed = null;
	}
	if (
		!parsed?.note ||
		parsed.problems.some((p) => p.kind === "newer-version")
	) {
		return {
			...base,
			note: null,
			preview: "",
			problem: "This template could not be read, so it can't be used.",
		};
	}
	return { ...base, note: parsed.note, preview: previewOf(parsed.note.blocks) };
}

async function walk(host: Host, folder: string, into: TemplateList) {
	const dir = folder === "" ? TEMPLATES : `${TEMPLATES}/${folder}`;
	for (const entry of await host.list(dir)) {
		if (entry.kind === "folder") {
			const label = join(folder, entry.name);
			into.folders.push({
				name: entry.name,
				label,
				path: `${TEMPLATES}/${label}`,
			});
			await walk(host, label, into);
		} else if (entry.name.toLowerCase().endsWith(NOTE_EXT)) {
			into.templates.push(
				await readEntry(host, `${dir}/${entry.name}`, folder),
			);
		}
	}
}

/**
 * Every template and folder, sorted by name. A file that can't be read is
 * listed with a problem, never hidden.
 */
export async function listTemplates(host: Host): Promise<TemplateList> {
	const list: TemplateList = { folders: [], templates: [] };
	if ((await host.kindOf(TEMPLATES)) !== "folder") return list;
	await walk(host, "", list);
	list.folders.sort(byLabel);
	list.templates.sort(byLabel);
	return list;
}

export type SaveTemplateResult =
	| { ok: true; path: string; replaced: boolean }
	| { ok: false; reason: "exists" | "invalid"; message: string };

async function ensureFolder(host: Host, rel: string) {
	await host.makeFolder(TEMPLATES);
	let at = TEMPLATES;
	for (const part of rel.split("/").filter(Boolean)) {
		at = `${at}/${part}`;
		if ((await host.kindOf(at)) === null) await host.makeFolder(at);
	}
}

/**
 * Save a note's blocks as a template called `name`, in `folder` (inside the
 * templates folder). A name already in use there is refused unless `replace` is
 * set; replacing first moves the old template to the recovery folder, so it is
 * never silently lost. Canvases can't be templates. The template gets its own
 * note id.
 */
export async function saveTemplate(
	host: Host,
	name: string,
	source: Note,
	options: { folder?: string; replace?: boolean; now?: Date } = {},
): Promise<SaveTemplateResult> {
	const title = name.trim();
	const folder = options.folder ?? "";
	if (title === "") {
		return {
			ok: false,
			reason: "invalid",
			message: "Give the template a name.",
		};
	}
	if (source.header.kind === "canvas") {
		return {
			ok: false,
			reason: "invalid",
			message: "A canvas can't be a template.",
		};
	}
	const template: Note = {
		header: { ...source.header, noteId: crypto.randomUUID(), title },
		blocks: source.blocks,
	};
	const check = prepareSave(template);
	if (!check.ok) {
		return {
			ok: false,
			reason: "invalid",
			message: `This note can't be saved as a template:\n${describeSaveProblems(check.problems)}`,
		};
	}
	await ensureFolder(host, folder);
	const dir = dirOf(folder);
	const files = (await host.list(dir)).map((entry) => entry.name);
	const key = nameKey(safeName(title, NOTE_EXT));
	const same = files.find((file) => nameKey(stem(file)) === key);
	if (same && !options.replace) {
		return {
			ok: false,
			reason: "exists",
			message: `A template called "${stem(same)}" already exists here.`,
		};
	}
	if (same) {
		await moveToRecovery(
			host,
			`${dir}/${same}`,
			`templates/${join(folder, same)}`,
			options.now,
		);
	}
	const path = `${dir}/${fileNameFor(
		title,
		files.filter((f) => f !== same),
	)}`;
	await host.writeTextAtomic(path, check.text);
	return { path, ok: true, replaced: Boolean(same) };
}

async function readTemplate(host: Host, path: string): Promise<Note> {
	if (!inside(path) || (await host.kindOf(path)) !== "file") {
		throw new Error("That template was not found.");
	}
	const parsed = parseNote(await host.readText(path));
	if (!parsed.note) throw new Error("That template could not be read.");
	return parsed.note;
}

/** Write edited blocks back into an existing template, keeping its name and id. */
export async function updateTemplate(
	host: Host,
	path: string,
	blocks: Block[],
): Promise<void> {
	const note = await readTemplate(host, path);
	const check = prepareSave({ ...note, blocks });
	if (!check.ok) {
		throw new Error(
			`This template can't be saved:\n${describeSaveProblems(check.problems)}`,
		);
	}
	await host.writeTextAtomic(path, check.text);
}

/** A folder at the top of the templates folder, or inside `parent`. */
export async function createTemplateFolder(
	host: Host,
	parent: string,
	name: string,
): Promise<{ path: string }> {
	const clean = safeName(name.trim());
	if (name.trim() === "") throw new Error("Give the folder a name.");
	await ensureFolder(host, parent);
	const dir = dirOf(parent);
	const taken = (await host.list(dir)).map((e) => e.name);
	if (taken.some((t) => nameKey(t) === nameKey(clean))) {
		throw new Error(`"${clean}" already exists here.`);
	}
	const path = `${dir}/${clean}`;
	await host.makeFolder(path);
	return { path };
}

/**
 * Rename a template or a folder. A template's title is saved first, then the
 * file is renamed to match. Names are compared the way the Mac compares them.
 */
export async function renameTemplateEntry(
	host: Host,
	path: string,
	newName: string,
): Promise<{ path: string }> {
	const title = newName.trim();
	if (title === "") throw new Error("Give it a name.");
	if (!inside(path)) throw new Error("That template was not found.");
	const kind = await host.kindOf(path);
	if (kind === null) throw new Error("That template was not found.");
	const dir = parentOf(path);
	const current = baseOf(path);
	const others = (await host.list(dir))
		.map((entry) => entry.name)
		.filter((file) => file !== current);
	const wanted = nameKey(
		kind === "folder" ? safeName(title) : safeName(title, NOTE_EXT),
	);
	if (
		others.some(
			(file) => nameKey(kind === "folder" ? file : stem(file)) === wanted,
		)
	) {
		throw new Error(`"${title}" already exists here.`);
	}
	if (kind === "folder") {
		const target = `${dir}/${safeName(title)}`;
		if (target !== path) await host.move(path, target);
		return { path: target };
	}
	const note = await readTemplate(host, path);
	const check = prepareSave({ ...note, header: { ...note.header, title } });
	if (!check.ok) throw new Error("That template can't be saved.");
	await host.writeTextAtomic(path, check.text);
	const target = `${dir}/${fileNameFor(title, others)}`;
	if (target !== path) await host.move(path, target);
	return { path: target };
}

/** A copy named "<name> copy" (then " copy 2", ...) next to it, with its own note id. */
export async function duplicateTemplate(
	host: Host,
	path: string,
): Promise<{ path: string }> {
	const note = await readTemplate(host, path);
	const dir = parentOf(path);
	const folder = dir === TEMPLATES ? "" : relOf(dir);
	const taken = new Set(
		(await host.list(dir)).map((entry) => nameKey(stem(entry.name))),
	);
	const base = `${stem(baseOf(path))} copy`;
	let title = base;
	for (let n = 2; taken.has(nameKey(title)); n++) title = `${base} ${n}`;
	const result = await saveTemplate(host, title, note, { folder });
	if (!result.ok) throw new Error(result.message);
	return { path: result.path };
}

/**
 * Remove a template or a folder with everything in it by moving it to the
 * recovery folder. Nothing is erased.
 */
export async function removeTemplateEntry(
	host: Host,
	path: string,
	now: Date = new Date(),
): Promise<void> {
	if (!inside(path) || (await host.kindOf(path)) === null) {
		throw new Error("That template was not found.");
	}
	await moveToRecovery(host, path, `templates/${relOf(path)}`, now);
}

const pad = (n: number) => String(n).padStart(2, "0");

/** How `{{date}}` is written. */
export const DATE_FORMATS = [
	"YYYY-MM-DD",
	"DD MMM YYYY",
	"MMM D, YYYY",
	"MM/DD/YYYY",
	"DD/MM/YYYY",
] as const;
export type DateFormat = (typeof DATE_FORMATS)[number];
/** How `{{time}}` is written: 24-hour (14:05) or 12-hour (2:05 PM). */
export type TimeFormat = "24h" | "12h";
export interface PlaceholderFormats {
	date: DateFormat;
	time: TimeFormat;
}
const DEFAULT_FORMATS: PlaceholderFormats = { date: "YYYY-MM-DD", time: "24h" };
const MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");

export function formatDate(now: Date, format: DateFormat): string {
	const y = now.getFullYear();
	const m = now.getMonth();
	const d = now.getDate();
	switch (format) {
		case "DD MMM YYYY":
			return `${pad(d)} ${MONTHS[m]} ${y}`;
		case "MMM D, YYYY":
			return `${MONTHS[m]} ${d}, ${y}`;
		case "MM/DD/YYYY":
			return `${pad(m + 1)}/${pad(d)}/${y}`;
		case "DD/MM/YYYY":
			return `${pad(d)}/${pad(m + 1)}/${y}`;
		default:
			return `${y}-${pad(m + 1)}-${pad(d)}`;
	}
}

export function formatTime(now: Date, format: TimeFormat): string {
	const h = now.getHours();
	const min = pad(now.getMinutes());
	if (format === "12h") return `${h % 12 || 12}:${min} ${h < 12 ? "AM" : "PM"}`;
	return `${pad(h)}:${min}`;
}

/** The values `{{title}}`, `{{date}}` and `{{time}}` are replaced with. */
export function placeholderValues(
	title: string,
	now: Date,
	formats: PlaceholderFormats = DEFAULT_FORMATS,
) {
	return {
		title,
		date: formatDate(now, formats.date),
		time: formatTime(now, formats.time),
	};
}

function fill(value: JsonValue, values: Record<string, string>): JsonValue {
	if (Array.isArray(value)) return value.map((item) => fill(item, values));
	if (value && typeof value === "object") {
		const out: { [k: string]: JsonValue } = {};
		for (const [key, inner] of Object.entries(value)) {
			out[key] =
				key === "text" && typeof inner === "string"
					? inner.replace(
							/\{\{(title|date|time)\}\}/g,
							(_, k: string) => values[k] ?? "",
						)
					: fill(inner, values);
		}
		return out;
	}
	return value;
}

/**
 * New blocks from a template: every block gets a fresh id (parents follow),
 * and `{{title}}`, `{{date}}` and `{{time}}` in text are filled in. The
 * template itself is not touched.
 */
export function blocksFromTemplate(
	template: Note,
	title: string,
	now: Date = new Date(),
	formats?: PlaceholderFormats,
): Block[] {
	const values = placeholderValues(title, now, formats);
	const ids = new Map<string, string>();
	for (const block of template.blocks) {
		if (block.id) ids.set(block.id, crypto.randomUUID());
	}
	return template.blocks.map((block) => {
		const copy = fill(block as JsonValue, values) as Block;
		const next: Block = { ...copy };
		if (block.id) next.id = ids.get(block.id);
		else delete next.id;
		next.parent =
			block.parent === null ? null : (ids.get(block.parent) ?? null);
		return next;
	});
}
