import type { Host } from "../../host/host";
import { describeSaveProblems } from "../note-format";
import { headerProps, type Props, setValue, withProps } from "./properties";
import { loadNote, saveNote } from "./repository";
import { isUnderTag } from "./tag-tree";
import { cleanTag, type TaggedRow, tagsOf } from "./tags";

/**
 * A tag list with `from` and every tag below it moved to `to` (`work/clients`
 * to `clients` also turns `work/clients/acme` into `clients/acme`). A tag that
 * lands on one already in the list is merged, ignoring capitals. Null when
 * nothing changes.
 */
export function renameTagList(
	tags: string[],
	from: string,
	to: string,
): string[] | null {
	// On a merge the spelling already in the note wins over the renamed one.
	const kept = new Map<string, { text: string; moved: boolean }>();
	for (const tag of tags) {
		const moved = isUnderTag(tag, from);
		const text = moved ? to + tag.slice(from.length) : tag;
		const known = kept.get(text.toLowerCase());
		if (!known) kept.set(text.toLowerCase(), { text, moved });
		else if (known.moved && !moved) {
			known.text = text;
			known.moved = false;
		}
	}
	const next = [...kept.values()].map((entry) => entry.text);
	return next.length === tags.length && next.every((t, i) => t === tags[i])
		? null
		: next;
}

/** The note's props with the rename applied; null when this note is unaffected. */
export function renameTagInProps(
	props: Props,
	from: string,
	to: string,
): Props | null {
	const next = renameTagList(tagsOf(props), from, to);
	if (next === null) return null;
	const key = Object.keys(props).find((k) => k.toLowerCase() === "tags");
	const set = key === undefined ? null : setValue(props, key, next);
	return set?.ok ? set.props : null;
}

/** The new name as stored, or why it can't be used. */
export function checkTagRename(
	from: string,
	raw: string,
): { ok: true; to: string } | { ok: false; message: string } {
	const to = cleanTag(raw);
	if (to === null)
		return { ok: false, message: "Type the new tag name first." };
	if (to === from) return { ok: false, message: "That is already its name." };
	return { ok: true, to };
}

/** The notes a rename would change; read-only ones can't be written. */
export function planTagRename<T extends TaggedRow & { readOnly?: boolean }>(
	rows: T[],
	from: string,
	to: string,
): { paths: string[]; readOnly: string[] } {
	const hit = rows.filter((r) => renameTagList(r.tags, from, to) !== null);
	return {
		paths: hit.filter((r) => !r.readOnly).map((r) => r.path),
		readOnly: hit.filter((r) => r.readOnly).map((r) => r.path),
	};
}

export interface TagRenameResult {
	changed: number;
	/** Plain-words problems, one per note that was left as it was. */
	problems: string[];
}

/**
 * Write the rename into each note on disk, one atomic save per note. For
 * notes that are NOT open: an open note must change through its own session.
 * A note that can't be read, or whose tags aren't a list, is skipped.
 */
export async function renameTagOnDisk(
	host: Host,
	paths: string[],
	from: string,
	to: string,
): Promise<TagRenameResult> {
	const result: TagRenameResult = { changed: 0, problems: [] };
	for (const path of paths) {
		try {
			const { note, problems } = await loadNote(host, path);
			const props =
				note && problems.length === 0 ? headerProps(note.header) : null;
			const next = props && renameTagInProps(props, from, to);
			if (!note || !next) {
				if (!props || !note)
					result.problems.push(`${path}: not changed (unreadable).`);
				continue;
			}
			const check = await saveNote(host, path, {
				...note,
				header: withProps(note.header, next),
			});
			if (check.ok) result.changed += 1;
			else
				result.problems.push(
					`${path}: ${describeSaveProblems(check.problems)}`,
				);
		} catch (error) {
			result.problems.push(
				`${path}: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}
	return result;
}
