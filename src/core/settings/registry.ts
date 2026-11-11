/**
 * The settings registry: every user setting is declared once, as data, and the
 * settings window, search, reset and export/import are all generated from it.
 *
 * Pure TypeScript: the storage is passed in (the app hands it `localStorage`),
 * so nothing here touches the window or the disk.
 *
 * Storage is additive. A setting is read from, and written back to, a path
 * inside one JSON blob under a storage key. Settings that existed before the
 * registry keep their old key and shape (`vaultops.theme`, `vaultops.fonts`,
 * `vaultops.appearance`); new settings share `vaultops.settings`. Fields the
 * registry does not know are preserved on every write.
 */

export const SETTING_TYPES = [
	"toggle",
	"select",
	"number",
	"text",
	"color",
	"font",
	"shortcut",
] as const;
export type SettingType = (typeof SETTING_TYPES)[number];

export type SettingValue = boolean | number | string;

export interface SettingOption {
	value: string;
	label: string;
}

/**
 * For a setting saved as a bare string under its own key (not inside a JSON
 * blob), the way it was saved before the registry existed. `decode` gets the
 * stored text, or null when nothing is saved; an unusable result falls back to
 * the default.
 */
export interface RawCodec {
	decode(text: string | null): unknown;
	encode(value: SettingValue): string;
}

/**
 * Where a setting lives: a path inside the JSON blob kept under `key`, or,
 * with `raw`, the whole value of `key` (then `path` is unused).
 */
export interface SettingStore {
	key: string;
	path: readonly string[];
	raw?: RawCodec;
}

export interface SettingDef {
	/** Stable id, used in search, export and import: `section.name`. */
	key: string;
	/** A section id from `SECTIONS`. */
	section: string;
	label: string;
	description?: string;
	type: SettingType;
	default: SettingValue;
	/** Choices for `select` and `font`. */
	options?: readonly SettingOption[];
	min?: number;
	max?: number;
	step?: number;
	/** Longest accepted `text` value. */
	maxLength?: number;
	/** A `text` setting edited in a multi-line box (for example CSS). */
	multiline?: boolean;
	/** Extra words that also find this setting in search. */
	keywords?: readonly string[];
	/** A heading inside the section that groups related settings. */
	group?: string;
	/**
	 * Defaults to `vaultops.settings` at `[key]`. Settings that predate the
	 * registry name their old key and path here.
	 */
	store?: SettingStore;
	/**
	 * Only the non-default value is written, and a default removes the field.
	 * Settings that are not sparse are always written, so an old reader of the
	 * same blob still sees the complete shape.
	 */
	sparse?: boolean;
}

export interface SettingSection {
	id: string;
	label: string;
}

/** The sections of the settings window, in order. Empty ones are not shown. */
export const SECTIONS: readonly SettingSection[] = [
	{ id: "general", label: "General" },
	{ id: "editor", label: "Editor" },
	{ id: "appearance", label: "Appearance" },
	{ id: "interface", label: "Interface" },
	{ id: "themes", label: "Themes" },
	{ id: "canvas", label: "Canvas" },
	{ id: "planner", label: "Planner & Logs" },
	{ id: "templates", label: "Templates & Resources" },
	{ id: "shortcuts", label: "Shortcuts" },
	{ id: "files", label: "Files & Vault" },
	{ id: "advanced", label: "Advanced" },
];

export const DEFAULT_STORAGE_KEY = "vaultops.settings";

const OPAQUE_HEX = /^#[\da-f]{6}$/i;
/** `Mod+Shift+K`: modifiers, then one key. */
const SHORTCUT = /^(?:(?:Mod|Ctrl|Alt|Shift)\+)*\S+$/;

export type CheckResult =
	| { ok: true; value: SettingValue }
	| { ok: false; reason: string };

/** Strictly check a raw value for a definition. Numbers outside the range are clamped, not refused. */
export function checkValue(def: SettingDef, raw: unknown): CheckResult {
	switch (def.type) {
		case "toggle":
			return typeof raw === "boolean"
				? { ok: true, value: raw }
				: { ok: false, reason: "expected true or false" };
		case "select":
		case "font": {
			const found = def.options?.find((o) => o.value === raw);
			return found
				? { ok: true, value: found.value }
				: { ok: false, reason: "not one of the choices" };
		}
		case "number": {
			if (typeof raw !== "number" || !Number.isFinite(raw))
				return { ok: false, reason: "expected a number" };
			const low = def.min ?? Number.NEGATIVE_INFINITY;
			const high = def.max ?? Number.POSITIVE_INFINITY;
			return { ok: true, value: Math.min(high, Math.max(low, raw)) };
		}
		case "text":
			return typeof raw === "string"
				? { ok: true, value: raw.slice(0, def.maxLength ?? 500) }
				: { ok: false, reason: "expected text" };
		case "color":
			// An empty string means "use the theme's color".
			if (raw === "") return { ok: true, value: "" };
			return typeof raw === "string" && OPAQUE_HEX.test(raw)
				? { ok: true, value: raw.toLowerCase() }
				: { ok: false, reason: "expected a #rrggbb color" };
		case "shortcut":
			// An empty string means "no shortcut".
			if (raw === "") return { ok: true, value: "" };
			return typeof raw === "string" && SHORTCUT.test(raw)
				? { ok: true, value: raw }
				: { ok: false, reason: "expected a key combination" };
	}
}

/** The value to use: the checked one, or the default when it is bad or missing. */
export function coerceValue(def: SettingDef, raw: unknown): SettingValue {
	const checked = checkValue(def, raw);
	return checked.ok ? checked.value : def.default;
}

/** Whether a setting matches a search query: every word must appear somewhere. */
export function matchesQuery(
	def: Pick<
		SettingDef,
		"label" | "description" | "group" | "keywords" | "options"
	>,
	query: string,
	sectionLabel = "",
): boolean {
	const words = query.toLowerCase().split(/\s+/).filter(Boolean);
	if (words.length === 0) return true;
	const haystack = [
		def.label,
		def.description ?? "",
		def.group ?? "",
		sectionLabel,
		...(def.keywords ?? []),
		...(def.options?.map((o) => o.label) ?? []),
	]
		.join(" ")
		.toLowerCase();
	return words.every((word) => haystack.includes(word));
}

/** The minimal storage the registry needs; `localStorage` fits. */
export interface SettingsStorage {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
	removeItem(key: string): void;
}

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json =>
	!!value && typeof value === "object" && !Array.isArray(value);

function readPath(root: unknown, path: readonly string[]): unknown {
	let at: unknown = root;
	for (const part of path) {
		if (!isObject(at)) return undefined;
		at = at[part];
	}
	return at;
}

function writePath(root: Json, path: readonly string[], value: unknown) {
	let at = root;
	for (const part of path.slice(0, -1)) {
		const next = at[part];
		if (isObject(next)) at = next;
		else {
			const made: Json = {};
			at[part] = made;
			at = made;
		}
	}
	const last = path[path.length - 1];
	if (last !== undefined) at[last] = value;
}

function deletePath(root: Json, path: readonly string[]) {
	let at = root;
	for (const part of path.slice(0, -1)) {
		const next = at[part];
		if (!isObject(next)) return;
		at = next;
	}
	const last = path[path.length - 1];
	if (last !== undefined) delete at[last];
}

export interface ImportReport {
	applied: string[];
	skipped: { key: string; reason: string }[];
}

export interface SettingsExport {
	app: "vaultops";
	version: 1;
	settings: Record<string, SettingValue>;
}

type ValueFor<T extends SettingType> = T extends "toggle"
	? boolean
	: T extends "number"
		? number
		: string;

export interface SettingsRegistry<D extends readonly SettingDef[]> {
	readonly definitions: D;
	get<K extends D[number]["key"]>(
		key: K,
	): ValueFor<Extract<D[number], { key: K }>["type"]>;
	/** Store a value; a bad one falls back to the default. Returns what was stored. */
	set<K extends D[number]["key"]>(
		key: K,
		value: ValueFor<Extract<D[number], { key: K }>["type"]>,
	): SettingValue;
	reset(key: D[number]["key"]): void;
	resetSection(section: string): void;
	isDefault(key: D[number]["key"]): boolean;
	/** Calls back with the changed keys after every write. Returns an unsubscribe. */
	subscribe(listener: (keys: readonly string[]) => void): () => void;
	definition(key: string): D[number] | undefined;
	forSection(section: string): D[number][];
	search(query: string): D[number][];
	exportSettings(): SettingsExport;
	/** Accepts the export shape or a flat `{ key: value }` map. Bad entries are skipped and reported. */
	importSettings(data: unknown): ImportReport;
}

export function createSettings<const D extends readonly SettingDef[]>(
	definitions: D,
	storage: SettingsStorage,
	sections: readonly SettingSection[] = SECTIONS,
): SettingsRegistry<D> {
	const byKey = new Map<string, SettingDef>();
	for (const def of definitions) {
		if (byKey.has(def.key)) throw new Error(`Duplicate setting ${def.key}`);
		byKey.set(def.key, def);
	}
	const listeners = new Set<(keys: readonly string[]) => void>();
	const storeOf = (def: SettingDef): SettingStore =>
		def.store ?? { key: DEFAULT_STORAGE_KEY, path: [def.key] };

	const readBlob = (key: string): Json => {
		try {
			const parsed: unknown = JSON.parse(storage.getItem(key) ?? "null");
			return isObject(parsed) ? parsed : {};
		} catch {
			return {};
		}
	};
	const writeBlob = (key: string, blob: Json) => {
		try {
			if (Object.keys(blob).length === 0) storage.removeItem(key);
			else storage.setItem(key, JSON.stringify(blob));
		} catch {
			/* Storage may be disabled; the value then lasts until the window closes. */
		}
	};

	const read = (def: SettingDef): SettingValue => {
		const { key, path, raw } = storeOf(def);
		if (raw) {
			let stored: string | null = null;
			try {
				stored = storage.getItem(key);
			} catch {
				/* Unreadable storage means the default. */
			}
			return coerceValue(def, raw.decode(stored));
		}
		return coerceValue(def, readPath(readBlob(key), path));
	};

	const write = (changes: [SettingDef, SettingValue][]) => {
		const touched = new Set(changes.map(([def]) => storeOf(def).key));
		for (const key of touched) {
			const rawChange = changes.find(
				([def]) => storeOf(def).key === key && storeOf(def).raw,
			);
			if (rawChange) {
				// A bare-string setting owns its key outright.
				try {
					storage.setItem(
						key,
						(storeOf(rawChange[0]).raw as RawCodec).encode(rawChange[1]),
					);
				} catch {
					/* Storage may be disabled; the value then lasts until the window closes. */
				}
				continue;
			}
			const blob = readBlob(key);
			const current = new Map(changes.map(([def, value]) => [def.key, value]));
			for (const def of definitions) {
				const store = storeOf(def);
				if (store.key !== key) continue;
				const changed = current.has(def.key);
				// Non-sparse siblings are rewritten so an older reader sees the full shape.
				if (!changed && def.sparse) continue;
				const value = changed
					? (current.get(def.key) as SettingValue)
					: read(def);
				if (def.sparse && value === def.default) deletePath(blob, store.path);
				else writePath(blob, store.path, value);
			}
			writeBlob(key, blob);
		}
		const keys = changes.map(([def]) => def.key);
		for (const listener of [...listeners]) listener(keys);
	};

	const need = (key: string): SettingDef => {
		const def = byKey.get(key);
		if (!def) throw new Error(`Unknown setting ${key}`);
		return def;
	};

	return {
		definitions,
		get: ((key: string) => read(need(key))) as SettingsRegistry<D>["get"],
		set: ((key: string, value: unknown) => {
			const def = need(key);
			const stored = coerceValue(def, value);
			write([[def, stored]]);
			return stored;
		}) as SettingsRegistry<D>["set"],
		reset: (key) => {
			const def = need(key);
			write([[def, def.default]]);
		},
		resetSection: (section) => {
			const changes = definitions
				.filter((def) => def.section === section)
				.map((def): [SettingDef, SettingValue] => [def, def.default]);
			if (changes.length > 0) write(changes);
		},
		isDefault: (key) => {
			const def = need(key);
			return read(def) === def.default;
		},
		subscribe: (listener) => {
			listeners.add(listener);
			return () => void listeners.delete(listener);
		},
		definition: (key) => byKey.get(key) as D[number] | undefined,
		forSection: (section) =>
			definitions.filter((def) => def.section === section),
		search: (query) => {
			const label = (id: string) =>
				sections.find((s) => s.id === id)?.label ?? "";
			return definitions.filter((def) =>
				matchesQuery(def, query, label(def.section)),
			);
		},
		exportSettings: () => ({
			app: "vaultops",
			version: 1,
			settings: Object.fromEntries(
				definitions.map((def) => [def.key, read(def)]),
			),
		}),
		importSettings: (data) => {
			const report: ImportReport = { applied: [], skipped: [] };
			const source =
				isObject(data) && isObject(data.settings) ? data.settings : data;
			if (!isObject(source)) {
				report.skipped.push({ key: "(file)", reason: "not a settings file" });
				return report;
			}
			const changes: [SettingDef, SettingValue][] = [];
			for (const [key, raw] of Object.entries(source)) {
				const def = byKey.get(key);
				if (!def) {
					report.skipped.push({ key, reason: "unknown setting" });
					continue;
				}
				const checked = checkValue(def, raw);
				if (!checked.ok) {
					report.skipped.push({ key, reason: checked.reason });
					continue;
				}
				changes.push([def, checked.value]);
				report.applied.push(key);
			}
			if (changes.length > 0) write(changes);
			return report;
		},
	};
}
