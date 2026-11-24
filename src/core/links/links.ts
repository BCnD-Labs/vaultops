import type { VaultReadHost } from "../../host/host";
import type { Block, JsonValue } from "../note-format";
import { scanVault } from "../notes/scan";

/** The inline item a link is saved as, inside a block's `content`. */
export const LINK_NODE = "noteLink";

export const LINK_KINDS = ["note", "canvas", "resource"] as const;
export type LinkKind = (typeof LINK_KINDS)[number];

/** Section names for the picker, in the order the kinds are listed. */
export const LINK_SECTIONS: Record<LinkKind, string> = {
	note: "Notes",
	canvas: "Canvases",
	resource: "Resources",
};

/** A link as saved: what it points at (a `noteId`) and the name it had when made. */
export interface LinkRef {
	kind: LinkKind;
	target: string;
	label: string;
}

/** Something a link can point at, with a hint line for the picker. */
export interface LinkTarget extends LinkRef {
	hint?: string;
	/** A resource's type name (Book, Contact…), which `@` lists as a category. */
	group?: string;
}

export function isLinkKind(value: unknown): value is LinkKind {
	return LINK_KINDS.includes(value as LinkKind);
}

function isObject(
	value: JsonValue | undefined,
): value is { [k: string]: JsonValue } {
	return !!value && typeof value === "object" && !Array.isArray(value);
}

/** Every link inside some blocks' text, in reading order. Damaged ones are skipped. */
export function linksIn(blocks: Block[]): LinkRef[] {
	const found: LinkRef[] = [];
	function walk(value: JsonValue | undefined) {
		if (Array.isArray(value)) {
			for (const item of value) walk(item);
			return;
		}
		if (!isObject(value)) return;
		if (value.type === LINK_NODE && isObject(value.attrs)) {
			const { kind, target, label } = value.attrs;
			if (isLinkKind(kind) && typeof target === "string" && target !== "") {
				found.push({
					kind,
					target,
					label: typeof label === "string" ? label : "",
				});
			}
			return;
		}
		walk(value.content);
	}
	for (const block of blocks) walk(block.content);
	return found;
}

function rank(label: string, words: string[]): number {
	const text = label.toLowerCase();
	if (words.length === 0) return 2;
	if (!words.every((w) => text.includes(w))) return -1;
	return text.startsWith(words[0] ?? "") ? 0 : 1;
}

/**
 * What the picker lists for what was typed: titles that start with it first,
 * then titles that contain it, grouped Notes, Canvases, Resources with a few
 * of each so no group crowds the others out. `scope: "resource"` is the `@`
 * shortcut.
 */
export function searchTargets(
	targets: LinkTarget[],
	query: string,
	scope: "all" | "resource" = "all",
	perKind = 8,
): LinkTarget[] {
	const words = query.toLowerCase().split(/\s+/).filter(Boolean);
	const out: LinkTarget[] = [];
	for (const kind of LINK_KINDS) {
		if (scope === "resource" && kind !== "resource") continue;
		const hits = targets
			.filter((t) => t.kind === kind)
			.map((t) => ({ t, r: rank(t.label, words) }))
			.filter((hit) => hit.r >= 0)
			.sort(
				(a, b) =>
					a.r - b.r ||
					a.t.label.localeCompare(b.t.label, undefined, {
						sensitivity: "base",
					}),
			);
		for (const hit of hits.slice(0, perKind)) out.push(hit.t);
	}
	return out;
}

/** A resource type offered by `@`, with how many resources it has. */
export interface MentionCategory {
	name: string;
	count: number;
}

export type MentionHit =
	| { kind: "category"; category: MentionCategory }
	| { kind: "target"; link: LinkTarget };

/** A name as compared by `@`: lower case, letters and digits only. */
const squash = (text: string) =>
	text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

/** The category `prefix` names: the exact name first, else the shortest that starts with it. */
function categoryFor(
	categories: MentionCategory[],
	prefix: string,
): MentionCategory | null {
	const key = squash(prefix);
	if (key === "") return null;
	const exact = categories.find((c) => squash(c.name) === key);
	if (exact) return exact;
	const starts = categories
		.filter((c) => squash(c.name).startsWith(key))
		.sort((a, b) => a.name.length - b.name.length);
	return starts[0] ?? null;
}

/**
 * What `@` offers for what was typed. With nothing typed: every resource type
 * (most used first), then resources. `@boo` lists the types that start with
 * it (Book) above the resources that match. `@book/` (or `@books/`, ignoring
 * capitals and punctuation) lists only that type's resources, filtered by what
 * comes after the `/`.
 */
export function searchMentions(
	targets: LinkTarget[],
	query: string,
	limit = 12,
): MentionHit[] {
	const resources = targets.filter((t) => t.kind === "resource");
	const counts = new Map<string, MentionCategory>();
	for (const r of resources) {
		if (!r.group) continue;
		const key = squash(r.group);
		const known = counts.get(key);
		if (known) known.count++;
		else counts.set(key, { name: r.group, count: 1 });
	}
	const categories = [...counts.values()].sort(
		(a, b) =>
			b.count - a.count ||
			a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
	);
	const slash = query.indexOf("/");
	const scoped =
		slash >= 0 ? categoryFor(categories, query.slice(0, slash)) : null;
	const text = scoped ? query.slice(slash + 1) : query;
	const pool = scoped
		? resources.filter(
				(r) => r.group && squash(r.group) === squash(scoped.name),
			)
		: resources;
	const out: MentionHit[] = [];
	if (!scoped) {
		const key = squash(text);
		for (const category of categories) {
			const name = squash(category.name);
			if (key === "" || name.startsWith(key) || name.includes(key)) {
				out.push({ kind: "category", category });
			}
		}
	}
	for (const link of searchTargets(pool, text, "resource", limit)) {
		out.push({ kind: "target", link });
	}
	return out;
}

/** A note or canvas that links to something. */
export interface Backlink {
	path: string;
	title: string;
	noteId: string;
	kind: "note" | "canvas";
}

/** Every note and canvas that links to `target` (a `noteId`), by title. Reads, never writes. */
export async function backlinks(
	host: VaultReadHost,
	target: string,
): Promise<Backlink[]> {
	const { notes } = await scanVault(host);
	const out: Backlink[] = [];
	for (const scanned of notes) {
		if (scanned.note.header.noteId === target) continue;
		if (!linksIn(scanned.note.blocks).some((link) => link.target === target))
			continue;
		const title = scanned.note.header.title;
		out.push({
			path: scanned.path,
			title: typeof title === "string" && title !== "" ? title : scanned.path,
			noteId: scanned.note.header.noteId,
			kind: scanned.kind,
		});
	}
	return out.sort((a, b) =>
		a.title.localeCompare(b.title, undefined, { sensitivity: "base" }),
	);
}
