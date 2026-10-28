import { type Host, HostError } from "../../host/host";
import { fileNameFor, NOTE_EXT } from "../file-name/file-name";
import { describeSaveProblems, type Note } from "../note-format";
import { isInsideVaultOps } from "../vault/vault";
import { checkVaultPath, nameKey } from "../vault-path/vault-path";
import { saveNote } from "./repository";

export interface RenameResult {
	/** Where the note is now (the old path when nothing moved). */
	path: string;
	/** True only when the file was moved to a new name. */
	renamed: boolean;
	/** Plain-words message for the person when something did not go through. */
	notice?: string;
}

export interface MoveResult {
	path: string;
	moved: boolean;
	notice?: string;
}

export interface NoteGuard {
	/** A note the scan marked read-only (damaged, newer or duplicated) is never written. */
	readOnly?: boolean;
}

function split(path: string): { folder: string; name: string } {
	const cut = path.lastIndexOf("/");
	return cut === -1
		? { folder: "", name: path }
		: { folder: path.slice(0, cut), name: path.slice(cut + 1) };
}

function join(folder: string, name: string): string {
	return folder === "" ? name : `${folder}/${name}`;
}

function message(error: unknown): string {
	return error instanceof HostError || error instanceof Error
		? error.message
		: String(error);
}

/**
 * Save the note with its new title in the header first, then rename the file
 * to match. If the rename fails the title stays saved and the file keeps its
 * old name, with a notice. The `noteId` and blocks never change here.
 */
export async function renameNote(
	host: Host,
	path: string,
	note: Note,
	newTitle: string,
	guard: NoteGuard = {},
): Promise<RenameResult> {
	if (guard.readOnly) {
		return {
			path,
			renamed: false,
			notice: "This note is read-only, so its title was not changed.",
		};
	}
	const check = await saveNote(host, path, {
		...note,
		header: { ...note.header, title: newTitle },
	});
	if (!check.ok) {
		return {
			path,
			renamed: false,
			notice: `The title was not saved:\n${describeSaveProblems(check.problems)}`,
		};
	}

	const { folder, name } = split(path);
	const others = (await host.list(folder))
		.map((entry) => entry.name)
		.filter((entry) => entry !== name);
	const target = fileNameFor(newTitle, others);
	if (target === name) return { path, renamed: false };

	const newPath = join(folder, target);
	try {
		await host.move(path, newPath);
	} catch (error) {
		return {
			path,
			renamed: false,
			notice: `The title was saved, but the file could not be renamed (${message(error)}). It keeps its old name.`,
		};
	}
	return { path: newPath, renamed: true };
}

/**
 * Move a note into another folder ("" is the vault root), keeping its name or,
 * if that name is taken there, the next free one (" 2", " 3", ...). Content and
 * `noteId` are untouched. Nothing is written for a destination inside
 * `.vaultops/` or for a read-only note.
 */
export async function moveNote(
	host: Host,
	path: string,
	folder: string,
	guard: NoteGuard = {},
): Promise<MoveResult> {
	const refuse = (notice: string): MoveResult => ({
		path,
		moved: false,
		notice,
	});
	if (guard.readOnly) {
		return refuse("This note is read-only, so it was not moved.");
	}
	const dest = checkVaultPath(folder, { allowRoot: true });
	if (!dest.ok || isInsideVaultOps(folder)) {
		return refuse("Notes can't be moved into that folder.");
	}
	if (folder !== "" && (await host.kindOf(folder)) !== "folder") {
		return refuse("That folder does not exist.");
	}

	const { folder: from, name } = split(path);
	if (nameKey(from) === nameKey(folder)) return { path, moved: false };

	const existing = (await host.list(folder)).map((entry) => entry.name);
	const taken = new Set(existing.map(nameKey));
	const target = taken.has(nameKey(name))
		? fileNameFor(name.slice(0, -NOTE_EXT.length), existing)
		: name;
	const newPath = join(folder, target);
	try {
		await host.move(path, newPath);
	} catch (error) {
		return refuse(`The note could not be moved (${message(error)}).`);
	}
	return { path: newPath, moved: true };
}
