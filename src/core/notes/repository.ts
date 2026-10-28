import type { Host } from "../../host/host";
import { fileNameFor, NOTE_EXT } from "../file-name/file-name";
import {
	NOTE_FORMAT,
	NOTE_FORMAT_VERSION,
	type Note,
	type ParseResult,
	parseNote,
	prepareSave,
	type SaveCheck,
} from "../note-format";
import { isInsideVaultOps } from "../vault/vault";

/** Create an empty note without adding history or changing its title. */
export async function createNote(
	host: Host,
	folder = "",
	title = "Untitled",
): Promise<{ path: string; note: Note }> {
	if (isInsideVaultOps(folder)) {
		throw new Error("Notes can't be created inside the .vaultops folder.");
	}
	const entries = await host.list(folder);
	const name = fileNameFor(
		title,
		entries.map((entry) => entry.name),
	);
	const path = folder === "" ? name : `${folder}/${name}`;
	const note: Note = {
		header: {
			format: NOTE_FORMAT,
			v: NOTE_FORMAT_VERSION,
			noteId: crypto.randomUUID(),
			title,
		},
		blocks: [],
	};
	const result = await saveNote(host, path, note);
	if (!result.ok) throw new Error("Empty note failed the save check");
	return { path, note };
}

/** Read without repairing or rewriting, including all parser diagnostics. */
export async function loadNote(host: Host, path: string): Promise<ParseResult> {
	return parseNote(await host.readText(path));
}

/** A refused save never reaches the host's atomic writer. */
export async function saveNote(
	host: Host,
	path: string,
	note: Note,
): Promise<SaveCheck> {
	const result = prepareSave(note);
	if (result.ok) await host.writeTextAtomic(path, result.text);
	return result;
}

/** Vault-relative paths to note files directly in this folder, sorted by name. */
export async function listNotes(host: Host, folder = ""): Promise<string[]> {
	if (isInsideVaultOps(folder)) return [];
	return (await host.list(folder))
		.filter(
			(entry) =>
				entry.kind === "file" && entry.name.toLowerCase().endsWith(NOTE_EXT),
		)
		.map((entry) => (folder === "" ? entry.name : `${folder}/${entry.name}`))
		.sort();
}
