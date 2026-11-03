import type { Host } from "../../host/host";
import { fileNameFor, NOTE_EXT } from "../file-name/file-name";
import { saveWithPending } from "../history/pending";
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

/** Create a note whose initial blocks are new, uncommitted changes. */
export async function createNote(
	host: Host,
	folder = "",
	title = "Untitled",
	initial?: Partial<Note>,
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
			...initial?.header,
			noteId: crypto.randomUUID(),
			title,
		},
		blocks: initial?.blocks ?? [
			{ id: crypto.randomUUID(), type: "paragraph", parent: null },
		],
	};
	const result = await saveWithPending(host, path, note, []);
	if (!result.ok) throw new Error("New note failed the save check");
	return { path, note };
}

/** Canvases use the same file naming and atomic creation path as notes. */
export function createCanvas(
	host: Host,
	folder = "",
	title = "Untitled canvas",
) {
	return createNote(host, folder, title, {
		header: {
			format: NOTE_FORMAT,
			v: NOTE_FORMAT_VERSION,
			noteId: "",
			kind: "canvas",
		},
		blocks: [],
	});
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
