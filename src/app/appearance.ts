import {
	Archive,
	Book,
	Bookmark,
	Briefcase,
	Calendar,
	Camera,
	Check,
	Code,
	Coffee,
	FileText,
	Flag,
	Flame,
	Folder,
	FolderOpen,
	Globe,
	GraduationCap,
	Hammer,
	Heart,
	House,
	Inbox,
	Leaf,
	Lightbulb,
	Lock,
	type LucideIcon,
	Mail,
	Music,
	Palette,
	Pin,
	Rocket,
	Smile,
	Sparkles,
	Star,
	Tag,
	Target,
	Zap,
} from "lucide-react";

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

/** Icons a folder or note may use. The key is what the file stores. */
export const ICONS: Record<string, LucideIcon> = {
	folder: Folder,
	"folder-open": FolderOpen,
	file: FileText,
	star: Star,
	heart: Heart,
	bookmark: Bookmark,
	book: Book,
	briefcase: Briefcase,
	code: Code,
	flame: Flame,
	lightbulb: Lightbulb,
	archive: Archive,
	inbox: Inbox,
	calendar: Calendar,
	camera: Camera,
	music: Music,
	coffee: Coffee,
	house: House,
	flag: Flag,
	globe: Globe,
	school: GraduationCap,
	hammer: Hammer,
	leaf: Leaf,
	lock: Lock,
	mail: Mail,
	palette: Palette,
	pin: Pin,
	rocket: Rocket,
	smile: Smile,
	sparkles: Sparkles,
	tag: Tag,
	target: Target,
	zap: Zap,
	check: Check,
};

export interface ItemStyle {
	icon?: string;
	tone?: Tone;
	mode?: StyleMode;
}

export interface Appearance {
	/** Keyed by the folder or note path. */
	items: Record<string, ItemStyle>;
	/** Keyed by the lower-cased tag. */
	tags: Record<string, Tone>;
}

export const EMPTY_APPEARANCE: Appearance = { items: {}, tags: {} };

const isTone = (value: unknown): value is Tone =>
	typeof value === "string" && (TONES as readonly string[]).includes(value);
const isMode = (value: unknown): value is StyleMode =>
	typeof value === "string" &&
	(STYLE_MODES as readonly string[]).includes(value);

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
			if (typeof v.icon === "string" && v.icon in ICONS) style.icon = v.icon;
			if (isTone(v.tone)) style.tone = v.tone;
			if (isMode(v.mode)) style.mode = v.mode;
			if (style.icon || style.tone) out.items[path] = style;
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
