import type { Host } from "../../host/host";
import type { Note } from "../note-format";
import { isInsideVaultOps } from "../vault/vault";
import { listNotes, loadNote } from "./repository";

export type NoteHealth = "good" | "truncated" | "newer-format" | "corrupt";

export interface ScannedNote {
	path: string;
	note: Note;
	/** Damaged, newer or duplicated notes must not be rewritten automatically. */
	readOnly: boolean;
}

export interface HealthEntry {
	path: string;
	group: NoteHealth;
	reason: string;
	/** Other files with the same noteId; independent of the health group. */
	duplicateOf: string[];
}

/** Read the entire vault without repairing, rewriting or assigning new IDs. */
export async function scanVault(
	host: Host,
): Promise<{ notes: ScannedNote[]; report: HealthEntry[] }> {
	const notes: ScannedNote[] = [];
	const report: HealthEntry[] = [];
	const byId = new Map<string, ScannedNote[]>();

	async function walk(folder: string): Promise<void> {
		if (isInsideVaultOps(folder)) return;
		for (const path of await listNotes(host, folder)) {
			const entry: HealthEntry = {
				path,
				group: "corrupt",
				reason: "The file has no usable note header.",
				duplicateOf: [],
			};
			report.push(entry);
			let parsed: Awaited<ReturnType<typeof loadNote>>;
			try {
				parsed = await loadNote(host, path);
			} catch {
				entry.reason = "The file could not be read.";
				continue;
			}
			if (!parsed.note) continue;
			if (parsed.problems.some((problem) => problem.kind === "newer-version")) {
				entry.group = "newer-format";
				entry.reason = "This note was written by a newer app version.";
			} else if (parsed.skippedLines.length > 0) {
				entry.group = "truncated";
				entry.reason =
					"Some lines could not be read; complete blocks were kept. Do not rewrite until Blake confirms.";
			} else if (parsed.problems.length > 0) {
				entry.reason =
					"The note has block or ID problems; its blocks were kept.";
			} else {
				entry.group = "good";
				entry.reason = "The note was read without problems.";
			}
			const scanned = {
				path,
				note: parsed.note,
				readOnly: entry.group !== "good",
			};
			notes.push(scanned);
			const copies = byId.get(parsed.note.header.noteId) ?? [];
			copies.push(scanned);
			byId.set(parsed.note.header.noteId, copies);
		}
		// Listing failures propagate: an incomplete walk must not look successful.
		for (const entry of await host.list(folder)) {
			if (entry.kind === "folder") {
				await walk(folder === "" ? entry.name : `${folder}/${entry.name}`);
			}
		}
	}

	await walk("");
	const reportByPath = new Map(report.map((entry) => [entry.path, entry]));
	for (const copies of byId.values()) {
		if (copies.length < 2) continue;
		for (const copy of copies) {
			copy.readOnly = true;
			const entry = reportByPath.get(copy.path);
			if (entry) {
				entry.duplicateOf = copies
					.filter((other) => other.path !== copy.path)
					.map((other) => other.path);
				entry.reason += " This note ID is also used by another file.";
			}
		}
	}
	return { notes, report };
}
