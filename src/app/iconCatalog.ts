import { icons, type LucideIcon } from "lucide-react";

/** `FolderOpen` becomes `folder-open`, `Table2` becomes `table-2`: the lucide names. */
export function toKebab(pascal: string): string {
	return pascal
		.replace(/([a-z])([A-Z])/g, "$1-$2")
		.replace(/([A-Za-z])(\d)/g, "$1-$2")
		.replace(/(\d)([A-Z])/g, "$1-$2")
		.toLowerCase();
}

/** Every lucide icon by its lucide (kebab-case) name. */
export const ICON_BY_NAME: ReadonlyMap<string, LucideIcon> = new Map(
	Object.entries(icons).map(([pascal, icon]) => [toKebab(pascal), icon]),
);

/** Names in alphabetical order. */
export const ICON_NAMES: readonly string[] = [...ICON_BY_NAME.keys()].sort();

/** Ids the first version saved that are not lucide names. */
export const LEGACY_ICON_IDS: Readonly<Record<string, string>> = {
	file: "file-text",
	school: "graduation-cap",
	music: "eighth-notes",
	smile: "face-slightly-smiling",
};

/** The lucide name for a saved id, or null when there is no such icon. */
export function canonicalIconName(id: string): string | null {
	const name = LEGACY_ICON_IDS[id] ?? id;
	return ICON_BY_NAME.has(name) ? name : null;
}

export function resolveIcon(id: string): LucideIcon | undefined {
	const name = canonicalIconName(id);
	return name ? ICON_BY_NAME.get(name) : undefined;
}

/** Hand-picked groups for browsing. Names that do not exist are skipped. */
export const ICON_CATEGORIES: readonly {
	id: string;
	label: string;
	names: string[];
}[] = [
	{
		id: "common",
		label: "Common",
		names: [
			"folder",
			"folder-open",
			"file-text",
			"star",
			"heart",
			"bookmark",
			"book",
			"briefcase",
			"code",
			"flame",
			"lightbulb",
			"archive",
			"inbox",
			"calendar",
			"camera",
			"eighth-notes",
			"coffee",
			"house",
			"flag",
			"globe",
			"graduation-cap",
			"hammer",
			"leaf",
			"lock",
			"mail",
			"palette",
			"pin",
			"rocket",
			"face-slightly-smiling",
			"sparkles",
			"tag",
			"target",
			"zap",
			"check",
		],
	},
	{
		id: "files",
		label: "Files",
		names: [
			"file",
			"file-text",
			"file-code",
			"file-image",
			"file-audio",
			"file-video",
			"files",
			"folder",
			"folder-closed",
			"folder-git",
			"folder-tree",
			"notebook",
			"notebook-pen",
			"book-open",
			"library",
			"scroll",
			"newspaper",
			"clipboard",
			"paperclip",
			"archive",
		],
	},
	{
		id: "work",
		label: "Work",
		names: [
			"briefcase",
			"building",
			"chart-bar",
			"chart-line",
			"chart-pie",
			"calculator",
			"calendar",
			"clock",
			"presentation",
			"square-kanban",
			"list-todo",
			"target",
			"trophy",
			"wallet",
			"landmark",
			"users",
			"handshake",
			"mail",
			"phone",
			"megaphone",
		],
	},
	{
		id: "tech",
		label: "Tech",
		names: [
			"code",
			"terminal",
			"cpu",
			"database",
			"server",
			"git-branch",
			"git-merge",
			"bug",
			"cloud",
			"wifi",
			"laptop",
			"smartphone",
			"monitor",
			"keyboard",
			"hard-drive",
			"network",
			"shield",
			"key",
			"lock",
			"bot",
		],
	},
	{
		id: "nature",
		label: "Nature",
		names: [
			"leaf",
			"tree-pine",
			"flower",
			"sun",
			"moon",
			"cloud-rain",
			"snowflake",
			"mountain",
			"waves",
			"flame",
			"droplet",
			"bird",
			"cat",
			"dog",
			"fish",
			"bug",
			"sprout",
			"wind",
			"earth",
			"rainbow",
		],
	},
	{
		id: "life",
		label: "Life",
		names: [
			"house",
			"coffee",
			"utensils",
			"shopping-cart",
			"car",
			"plane",
			"bike",
			"eighth-notes",
			"gamepad-2",
			"film",
			"camera",
			"dumbbell",
			"heart-pulse",
			"baby",
			"gift",
			"map-pin",
			"compass",
			"palette",
			"paintbrush",
			"graduation-cap",
		],
	},
];

/** Extra search words for icons whose lucide name is not what people would type. */
const KEYWORDS: Readonly<Record<string, string>> = {
	"file-text": "note document page",
	"graduation-cap": "school class study",
	house: "home",
	"chart-bar": "graph stats",
	"chart-line": "graph stats trend",
	"chart-pie": "graph stats",
	"square-kanban": "board tasks",
	"list-todo": "tasks checklist",
	briefcase: "work job",
	lightbulb: "idea",
	trash: "delete bin",
	"trash-2": "delete bin",
	settings: "gear preferences",
	bookmark: "save",
	archive: "box storage",
	sparkles: "magic new",
	flame: "fire hot",
};

/** Case-insensitive match on name and keywords. Names that start with the query come first. */
export function searchIcons(
	query: string,
	limit = Number.POSITIVE_INFINITY,
): string[] {
	const words = query
		.toLowerCase()
		.split(/[\s-]+/)
		.filter(Boolean);
	if (words.length === 0) return ICON_NAMES.slice(0, limit);
	const starts: string[] = [];
	const rest: string[] = [];
	for (const name of ICON_NAMES) {
		const hay = `${name} ${KEYWORDS[name] ?? ""}`;
		const flat = name.replace(/-/g, "");
		if (!words.every((w) => hay.includes(w) || flat.includes(w))) continue;
		(name.startsWith(words[0] ?? "") ? starts : rest).push(name);
	}
	return [...starts, ...rest].slice(0, limit);
}

const RECENT_KEY = "vaultops.recentIcons";
const RECENT_MAX = 14;

export function readRecentIcons(
	storage: Pick<Storage, "getItem"> = localStorage,
): string[] {
	try {
		const raw: unknown = JSON.parse(storage.getItem(RECENT_KEY) ?? "[]");
		return Array.isArray(raw)
			? raw
					.filter(
						(n): n is string => typeof n === "string" && ICON_BY_NAME.has(n),
					)
					.slice(0, RECENT_MAX)
			: [];
	} catch {
		return [];
	}
}

/** Put a name first in the recent list; returns the new list. */
export function pushRecentIcon(
	name: string,
	storage: Pick<Storage, "getItem" | "setItem"> = localStorage,
): string[] {
	const next = [
		name,
		...readRecentIcons(storage).filter((n) => n !== name),
	].slice(0, RECENT_MAX);
	try {
		storage.setItem(RECENT_KEY, JSON.stringify(next));
	} catch {
		/* private mode or full: recents are a convenience only */
	}
	return next;
}
