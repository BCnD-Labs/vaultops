import { resolveIcon } from "./iconCatalog";

/** Where the sidebar colours, icons and tag colours are kept inside the vault. */
export const APPEARANCE_PATH = ".vaultops/appearance.json";

/** Colour names the theme defines as `--tone-<name>`. */
export const TONES = [
	"red",
	"orange",
	"yellow",
	"green",
	"teal",
	"blue",
	"purple",
	"pink",
	"gray",
] as const;
export type Tone = (typeof TONES)[number];

/** Which part of a sidebar row the colour is painted on. */
export const STYLE_MODES = [
	"icon",
	"text",
	"icon-text",
	"border",
	"background",
	"border-background",
] as const;
export type StyleMode = (typeof STYLE_MODES)[number];

export const STYLE_MODE_LABELS: Record<StyleMode, string> = {
	icon: "Icon",
	text: "Text",
	"icon-text": "Icon and text",
	border: "Border",
	background: "Background",
	"border-background": "Border and background",
};

/** The four parts of a row that can be painted, each on its own. */
export const STYLE_PARTS = ["icon", "text", "border", "background"] as const;
export type StylePart = (typeof STYLE_PARTS)[number];

export const STYLE_PART_LABELS: Record<StylePart, string> = {
	icon: "Icon",
	text: "Text",
	border: "Border",
	background: "Background",
};

/** A tone name (follows the theme) or a fixed `#rrggbb` colour. */
export type StyleColour = string;

/** One painted part. Present means on; `alpha` (0 to 1) is only read for the background. */
export interface PartStyle {
	color: StyleColour;
	alpha?: number;
}

export type StyleParts = Partial<Record<StylePart, PartStyle>>;

/** Background tint strength when none was chosen; matches the old single-colour look. */
export const DEFAULT_BACKGROUND_ALPHA = 0.16;

/**
 * What is saved for a folder or note. `icon` is a lucide name (older ids still
 * resolve). `parts` is the current shape. `tone` and `mode` are the older
 * single-colour shape: still read, and still written when `parts` can be
 * expressed that way so an older build shows the same thing.
 */
export interface ItemStyle {
	icon?: string;
	parts?: StyleParts;
	tone?: Tone;
	mode?: StyleMode;
}

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** `#abc` or `#AABBCC` become `#aabbcc`; anything else is null. */
export function normalizeHex(value: string): string | null {
	const text = value.trim();
	const m = HEX.exec(text.startsWith("#") ? text : `#${text}`);
	if (!m) return null;
	let digits = (m[1] ?? "").toLowerCase();
	if (digits.length === 3) digits = [...digits].map((c) => c + c).join("");
	return `#${digits}`;
}

export const isTone = (value: unknown): value is Tone =>
	typeof value === "string" && (TONES as readonly string[]).includes(value);

/** A valid saved colour, or null. */
export function normalizeColour(value: unknown): StyleColour | null {
	if (isTone(value)) return value;
	return typeof value === "string" ? normalizeHex(value) : null;
}

/** CSS for a saved colour. */
export function colourCss(colour: StyleColour): string {
	return isTone(colour) ? `var(--tone-${colour})` : colour;
}

const MODE_PARTS: Record<StyleMode, StylePart[]> = {
	icon: ["icon"],
	text: ["text"],
	"icon-text": ["icon", "text"],
	border: ["border"],
	background: ["background"],
	"border-background": ["border", "background"],
};

/** The parts an older single-colour style paints. */
export function partsFromLegacy(tone: Tone, mode: StyleMode): StyleParts {
	const out: StyleParts = {};
	for (const part of MODE_PARTS[mode]) out[part] = { color: tone };
	return out;
}

/** The parts a style paints, whichever shape it was saved in. */
export function partsOf(style: ItemStyle | undefined): StyleParts {
	if (!style) return {};
	if (style.parts) return style.parts;
	return style.tone ? partsFromLegacy(style.tone, modeOf(style)) : {};
}

/** The older tone and mode that show the same thing as `parts`, if there is one. */
export function legacyOf(
	parts: StyleParts,
): { tone: Tone; mode: StyleMode } | null {
	const active = STYLE_PARTS.filter((p) => parts[p]);
	const first = parts[active[0] ?? "icon"];
	if (!first || !isTone(first.color)) return null;
	for (const p of active) {
		if (parts[p]?.color !== first.color) return null;
	}
	const bg = parts.background;
	if (
		bg?.alpha !== undefined &&
		Math.abs(bg.alpha - DEFAULT_BACKGROUND_ALPHA) > 0.001
	) {
		return null;
	}
	const mode = STYLE_MODES.find(
		(m) =>
			MODE_PARTS[m].length === active.length &&
			MODE_PARTS[m].every((p) => parts[p]),
	);
	return mode ? { tone: first.color, mode } : null;
}

/** Build what gets saved, or null when nothing is customised. */
export function buildStyle(
	icon: string | undefined,
	parts: StyleParts,
): ItemStyle | null {
	const active = STYLE_PARTS.filter((p) => parts[p]);
	if (!icon && active.length === 0) return null;
	const out: ItemStyle = {};
	if (icon) out.icon = icon;
	if (active.length > 0) {
		const clean: StyleParts = {};
		for (const p of active) clean[p] = parts[p];
		out.parts = clean;
		const legacy = legacyOf(clean);
		if (legacy) {
			out.tone = legacy.tone;
			out.mode = legacy.mode;
		}
	}
	return out;
}

/** CSS custom properties and data attributes a row needs to be painted. */
export function rowPaint(style: ItemStyle | undefined): {
	style: Record<string, string>;
	attrs: Record<string, string>;
} {
	const parts = partsOf(style);
	const css: Record<string, string> = {};
	const attrs: Record<string, string> = {};
	for (const part of STYLE_PARTS) {
		const p = parts[part];
		if (!p) continue;
		css[`--paint-${part}`] = colourCss(p.color);
		attrs[`data-paint-${part}`] = "";
		if (part === "background") {
			const alpha = p.alpha ?? DEFAULT_BACKGROUND_ALPHA;
			css["--paint-background-alpha"] = `${Math.round(alpha * 100)}%`;
		}
	}
	return { style: css, attrs };
}

export interface Appearance {
	/** Keyed by the folder or note path. */
	items: Record<string, ItemStyle>;
	/** Keyed by the lower-cased tag. */
	tags: Record<string, Tone>;
}

export const EMPTY_APPEARANCE: Appearance = { items: {}, tags: {} };

const isMode = (value: unknown): value is StyleMode =>
	typeof value === "string" &&
	(STYLE_MODES as readonly string[]).includes(value);

function parseParts(raw: unknown): StyleParts | null {
	if (!raw || typeof raw !== "object") return null;
	const out: StyleParts = {};
	for (const part of STYLE_PARTS) {
		const p = (raw as Record<string, unknown>)[part];
		if (!p || typeof p !== "object") continue;
		const colour = normalizeColour((p as Record<string, unknown>).color);
		if (!colour) continue;
		const entry: PartStyle = { color: colour };
		const alpha = (p as Record<string, unknown>).alpha;
		if (part === "background" && typeof alpha === "number" && alpha >= 0) {
			entry.alpha = Math.min(1, alpha);
		}
		out[part] = entry;
	}
	return Object.keys(out).length > 0 ? out : null;
}

/** Read the file's text. Anything unreadable or unknown is dropped, never thrown. */
export function parseAppearance(text: string | null): Appearance {
	if (!text) return { items: {}, tags: {} };
	let raw: unknown;
	try {
		raw = JSON.parse(text);
	} catch {
		return { items: {}, tags: {} };
	}
	const out: Appearance = { items: {}, tags: {} };
	if (!raw || typeof raw !== "object") return out;
	const { items, tags } = raw as { items?: unknown; tags?: unknown };
	if (items && typeof items === "object") {
		for (const [path, value] of Object.entries(items)) {
			if (!value || typeof value !== "object") continue;
			const v = value as Record<string, unknown>;
			const style: ItemStyle = {};
			if (typeof v.icon === "string" && resolveIcon(v.icon))
				style.icon = v.icon;
			if (isTone(v.tone)) style.tone = v.tone;
			if (isMode(v.mode)) style.mode = v.mode;
			const parts = parseParts(v.parts);
			if (parts) style.parts = parts;
			if (style.icon || style.tone || style.parts) out.items[path] = style;
		}
	}
	if (tags && typeof tags === "object") {
		for (const [tag, tone] of Object.entries(tags)) {
			if (isTone(tone)) out.tags[tag.toLowerCase()] = tone;
		}
	}
	return out;
}

export function serializeAppearance(appearance: Appearance): string {
	return `${JSON.stringify({ v: 1, ...appearance }, null, 2)}\n`;
}

/** Tags the user never coloured still get a steady colour from their name. */
const TAG_TONES: Tone[] = TONES.filter((t) => t !== "gray");

export function tagTone(tag: string, appearance: Appearance): Tone {
	const key = tag.toLowerCase();
	const chosen = appearance.tags[key];
	if (chosen) return chosen;
	let hash = 0;
	for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
	return TAG_TONES[hash % TAG_TONES.length] ?? "gray";
}

/** The mode a row uses when a colour was chosen but no mode was. */
export function modeOf(style: ItemStyle | undefined): StyleMode {
	return style?.mode ?? "icon-text";
}
