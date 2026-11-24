/**
 * Merging a branch into the current one, end to end (uses the host): start
 * the merge, combine every note changed on both sides block by block, keep
 * anything that can't be combined, and mark the files merged. The caller then
 * shows the report and finishes (a save point) or cancels (everything back).
 *
 * Nothing is silently lost: a file that isn't a note, or a note that can't be
 * read, keeps the current branch's version and the other branch's version is
 * copied into the recovery folder, which the report lists.
 */
import type { Host } from "../../host/host";
import { parseNote, prepareSave } from "../note-format";
import { writeToRecovery } from "../notes/trash";
import { type MergeConflict, mergeNotes } from "./merge";

export type FileOutcome =
	/** Combined block by block. */
	| { path: string; kind: "merged"; conflicts: MergeConflict[] }
	/** Deleted on one side and edited on the other: the edited one is kept. */
	| { path: string; kind: "kept-edited" }
	/** Couldn't be combined: yours kept, theirs copied to `recoveryPath`. */
	| { path: string; kind: "kept-mine"; recoveryPath: string; reason: string };

export interface MergeReport {
	branch: string;
	upToDate: boolean;
	/** Every file the merge changes. */
	changed: string[];
	/** What happened to each file changed on both sides. */
	outcomes: FileOutcome[];
}

type MergeHost = Pick<
	Host,
	"vcs" | "writeTextAtomic" | "makeFolder" | "kindOf"
>;

const isNote = (path: string) => /\.vnote$/i.test(path);

async function combine(
	host: MergeHost,
	path: string,
	branch: string,
	now: Date,
): Promise<FileOutcome> {
	const { base, mine, theirs } = await host.vcs.mergeStages(path);
	const keepMine = async (reason: string): Promise<FileOutcome> => {
		const { recoveryPath } = await writeToRecovery(
			host,
			`merge from ${branch}/${path}`,
			theirs ?? "",
			now,
		);
		if (mine !== null) await host.writeTextAtomic(path, mine);
		return { path, kind: "kept-mine", recoveryPath, reason };
	};
	// Deleted on one side, edited on the other: keep the edited version.
	if (mine === null && theirs !== null) {
		await host.writeTextAtomic(path, theirs);
		return { path, kind: "kept-edited" };
	}
	if (theirs === null && mine !== null) {
		await host.writeTextAtomic(path, mine);
		return { path, kind: "kept-edited" };
	}
	if (mine === null || theirs === null)
		return keepMine("missing on both sides");
	if (!isNote(path)) return keepMine("not a note, so it can't be combined");
	const parsed = [base, mine, theirs].map((t) =>
		t === null ? null : parseNote(t),
	);
	const [b, m, t] = parsed;
	if (!m?.note || !t?.note || m.problems.length > 0 || t.problems.length > 0)
		return keepMine("one side of this note can't be read completely");
	const result = mergeNotes(b?.note ?? null, m.note, t.note, {
		theirsLabel: branch,
	});
	const check = prepareSave(result.note);
	if (!check.ok) return keepMine("the combined note couldn't be saved");
	await host.writeTextAtomic(path, check.text);
	return { path, kind: "merged", conflicts: result.conflicts };
}

/** Start merging `branch` and combine what changed on both sides. */
export async function runBranchMerge(
	host: MergeHost,
	branch: string,
	now: Date = new Date(),
): Promise<MergeReport> {
	const start = await host.vcs.mergeStart(branch);
	const outcomes: FileOutcome[] = [];
	if (!start.upToDate) {
		for (const path of start.conflicted)
			outcomes.push(await combine(host, path, branch, now));
		await host.vcs.mergeMarkResolved(start.conflicted);
	}
	return { branch, upToDate: start.upToDate, changed: start.changed, outcomes };
}
