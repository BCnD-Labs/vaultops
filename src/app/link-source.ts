import {
	type LinkKind,
	type LinkRef,
	type LinkTarget,
	searchTargets,
} from "../core/links/links";
import {
	cardFields,
	type ResourceCard,
	type ResourceType,
} from "../core/resources/resources";
import type { LinkSource } from "../editor/note-link";
import type { NoteRow } from "./session";

const folderOf = (path: string) => {
	const slash = path.lastIndexOf("/");
	return slash < 0 ? undefined : path.slice(0, slash);
};

/** Everything a link can point at, from what the app already has loaded. */
export function linkTargets(
	notes: NoteRow[],
	cards: ResourceCard[],
	types: ResourceType[],
): LinkTarget[] {
	const out: LinkTarget[] = [];
	for (const row of notes) {
		if (!row.id) continue;
		out.push({
			kind: row.kind === "canvas" ? "canvas" : "note",
			target: row.id,
			label: row.title,
			hint: folderOf(row.path),
		});
	}
	for (const card of cards) {
		if (card.problem || !card.noteId) continue;
		const type = types.find((t) => t.id === card.typeId) ?? null;
		// The type and the first thing filled in, so two Sams can be told apart.
		const detail = type
			? cardFields(card, type).find((f) => f.value.trim() !== "")?.value
			: undefined;
		out.push({
			kind: "resource",
			target: card.noteId,
			label: card.title,
			hint:
				[type?.name, detail?.trim().slice(0, 24)].filter(Boolean).join(" · ") ||
				undefined,
		});
	}
	return out;
}

/** What the editor needs to offer, show and open links. */
export function buildLinkSource(
	targets: LinkTarget[],
	open: (link: LinkRef) => void,
): LinkSource {
	const byKey = new Map<string, LinkTarget>();
	for (const target of targets)
		byKey.set(`${target.kind}:${target.target}`, target);
	return {
		search: (query, scope) => searchTargets(targets, query, scope),
		describe: (kind: LinkKind, target) =>
			byKey.get(`${kind}:${target}`)?.label ?? null,
		open,
	};
}
