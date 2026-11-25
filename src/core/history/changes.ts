/**
 * The Changes panel's logic (uses the host): what changed since the last save
 * point, a one-line summary per note, and discarding a change. Discarding
 * never loses text: the current version is copied (or a new file moved) into
 * the recovery folder first.
 */
import type { Host, VcsChange } from "../../host/host";
import { type Note, parseNote } from "../note-format";
import { moveToRecovery, writeToRecovery } from "../notes/trash";
import { isInsideVaultOps } from "../vault/vault";
import { diffNotes, type NoteDiff, summarizeDiff } from "./diff";

export interface ChangeGroups {
	notes: VcsChange[];
	attachments: VcsChange[];
	appData: VcsChange[];
}

const isNote = (path: string) => /\.vnote$/i.test(path);

/** Notes first, then other files in the vault, then the app's own data. */
export function groupChanges(changes: readonly VcsChange[]): ChangeGroups {
	const groups: ChangeGroups = { notes: [], attachments: [], appData: [] };
	for (const c of changes) {
		if (isInsideVaultOps(c.path)) groups.appData.push(c);
		else if (isNote(c.path)) groups.notes.push(c);
		else groups.attachments.push(c);
	}
	return groups;
}

type ReadHost = Pick<Host, "vcs" | "readText">;

const parse = (text: string | null): Note | null =>
	text === null ? null : parseNote(text).note;

/** The newest save point's id, which the panel compares against. */
export async function lastSavePoint(
	host: Pick<Host, "vcs">,
): Promise<string | null> {
	const page = await host.vcs.log({ skip: 0, limit: 1 });
	return page.entries[0]?.id ?? null;
}

async function saved(
	host: ReadHost,
	head: string | null,
	path: string,
): Promise<string | null> {
	if (!head) return null;
	try {
		return await host.vcs.show(head, path);
	} catch {
		return null;
	}
}

async function current(host: ReadHost, path: string): Promise<string | null> {
	try {
		return await host.readText(path);
	} catch {
		return null;
	}
}

/** A note's changes since the last save point, and its one-line summary. */
export async function noteChange(
	host: ReadHost,
	change: VcsChange,
	head: string | null,
): Promise<{ summary: string; diff: NoteDiff | null }> {
	if (change.kind === "untracked" || change.kind === "added")
		return { summary: "New note", diff: null };
	if (change.kind === "deleted") return { summary: "Deleted", diff: null };
	const before = parse(await saved(host, head, change.from ?? change.path));
	const after = parse(await current(host, change.path));
	if (!before || !after) return { summary: "Changed", diff: null };
	const diff = diffNotes(before, after);
	const renamed = change.from ? `Renamed from ${change.from}` : "";
	const words = diff.same ? "" : summarizeDiff(diff);
	return {
		summary: [renamed, words].filter(Boolean).join(" · ") || "Changed",
		diff,
	};
}

type DiscardHost = Pick<
	Host,
	"vcs" | "readText" | "writeTextAtomic" | "makeFolder" | "kindOf" | "move"
>;

/**
 * Put one file back to how it was at the last save point. A new file moves to
 * the recovery folder; a changed one is copied there first. Resolves to where
 * the current version was kept, or null when there was nothing to keep.
 */
export async function discardChange(
	host: DiscardHost,
	change: VcsChange,
	head: string | null,
	now: Date = new Date(),
): Promise<string | null> {
	const keptAs = (path: string) => `discarded/${path}`;
	if (change.kind === "untracked" || change.kind === "added") {
		return (await moveToRecovery(host, change.path, keptAs(change.path), now))
			.recoveryPath;
	}
	const original = change.from ?? change.path;
	const old = await saved(host, head, original);
	if (old === null)
		throw new Error(
			`The saved version of ${original} couldn't be read, so nothing was changed.`,
		);
	let kept: string | null = null;
	if (change.kind !== "deleted") {
		if (change.from)
			kept = (await moveToRecovery(host, change.path, keptAs(change.path), now))
				.recoveryPath;
		else {
			const text = await current(host, change.path);
			if (text !== null)
				kept = (await writeToRecovery(host, keptAs(change.path), text, now))
					.recoveryPath;
		}
	}
	const slash = original.lastIndexOf("/");
	if (slash > 0) await host.makeFolder(original.slice(0, slash));
	await host.writeTextAtomic(original, old);
	return kept;
}
