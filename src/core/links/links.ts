import type { Host } from "../../host/host";
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

/** A note or canvas that links to something. */
export interface Backlink {
	path: string;
	title: string;
	kind: "note" | "canvas";
}

/** Every note and canvas that links to `target` (a `noteId`), by title. Reads, never writes. */
export async function backlinks(
	host: Host,
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
			kind: scanned.kind,
		});
	}
	return out.sort((a, b) =>
		a.title.localeCompare(b.title, undefined, { sensitivity: "base" }),
	);
}
