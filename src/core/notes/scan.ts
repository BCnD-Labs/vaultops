import type { Host } from "../../host/host";
import type { Block, JsonValue, Note } from "../note-format";
import { isInsideVaultOps } from "../vault/vault";
import { listNotes, loadNote } from "./repository";

export type NoteHealth = "good" | "truncated" | "newer-format" | "corrupt";

export interface ScannedNote {
	path: string;
	note: Note;
	kind: "note" | "canvas";
	preview: string;
	/** Damaged, newer or duplicated notes must not be rewritten automatically. */
	readOnly: boolean;
}

export interface HealthEntry {
	path: string;
	group: NoteHealth;
	reason: string;
	/** Other files with the same noteId; independent of the health group. */
	duplicateOf: string[];
	/** Other documents containing one or more of this document's block IDs. */
	duplicateBlockOf?: string[];
}

/** Read the entire vault without repairing, rewriting or assigning new IDs. */
export async function scanVault(host: Host): Promise<{
	notes: ScannedNote[];
	report: HealthEntry[];
	/** Every folder outside `.vaultops/`, empty ones included. */
	folders: string[];
}> {
	const notes: ScannedNote[] = [];
	const folders: string[] = [];
	const report: HealthEntry[] = [];
	const byId = new Map<string, ScannedNote[]>();
	const byBlockId = new Map<string, Set<string>>();

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
					"Some lines could not be read, so only the complete blocks are shown. Nothing is changed unless you choose to edit it.";
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
				kind:
					parsed.note.header.kind === "canvas"
						? ("canvas" as const)
						: ("note" as const),
				preview: previewOf(parsed.note.blocks),
				readOnly: entry.group !== "good",
			};
			notes.push(scanned);
			const copies = byId.get(parsed.note.header.noteId) ?? [];
			copies.push(scanned);
			byId.set(parsed.note.header.noteId, copies);
			for (const block of parsed.note.blocks) {
				if (!block.id) continue;
				const paths = byBlockId.get(block.id) ?? new Set<string>();
				paths.add(path);
				byBlockId.set(block.id, paths);
			}
		}
		// Listing failures propagate: an incomplete walk must not look successful.
		for (const entry of await host.list(folder)) {
			if (entry.kind === "folder") {
				const child = folder === "" ? entry.name : `${folder}/${entry.name}`;
				if (!isInsideVaultOps(child)) folders.push(child);
				await walk(child);
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
	for (const paths of byBlockId.values()) {
		if (paths.size < 2) continue;
		for (const path of paths) {
			const entry = reportByPath.get(path);
			if (!entry) continue;
			const others = new Set(entry.duplicateBlockOf ?? []);
			for (const other of paths) if (other !== path) others.add(other);
			entry.duplicateBlockOf = [...others].sort();
		}
	}
	for (const entry of report) {
		if (entry.duplicateBlockOf?.length)
			entry.reason += " A block exists in two places.";
	}
	return { notes, report, folders };
}

/** The first 160 characters of the body text, for lists. */
export function previewOf(blocks: Block[]): string {
	return plainText(blocks).slice(0, 160);
}

/** All of a note's body text on one line (capped), for searching inside notes. */
export const SEARCH_TEXT_LIMIT = 20000;
export function searchTextOf(blocks: Block[]): string {
	return plainText(blocks).slice(0, SEARCH_TEXT_LIMIT);
}

/** A math block's LaTeX source: it is the block's text, so it is searchable. */
function latex(block: Block): string {
	const attrs = block.attrs;
	return attrs &&
		typeof attrs === "object" &&
		!Array.isArray(attrs) &&
		typeof attrs.latex === "string"
		? attrs.latex
		: "";
}

/** Plain body text only; never include marks or block IDs (a math block's LaTeX counts as its text). */
function plainText(blocks: Block[]): string {
	function text(value: JsonValue | undefined): string {
		if (Array.isArray(value)) return value.map(text).join("");
		if (!value || typeof value !== "object") return "";
		if (value.type === "hardBreak") return " ";
		if (
			value.type === "date" &&
			value.attrs &&
			typeof value.attrs === "object" &&
			!Array.isArray(value.attrs) &&
			typeof value.attrs.date === "string"
		)
			return value.attrs.date;
		if (
			value.type === "noteLink" &&
			value.attrs &&
			typeof value.attrs === "object" &&
			!Array.isArray(value.attrs) &&
			typeof value.attrs.label === "string"
		)
			return value.attrs.label;
		if (value.type === "text" && typeof value.text === "string")
			return value.text;
		return text(value.content);
	}
	return blocks
		.map((block) =>
			block.type === "mathBlock" ? latex(block) : text(block.content),
		)
		.join(" ")
		.replace(/\s+/g, " ")
		.trim();
}
