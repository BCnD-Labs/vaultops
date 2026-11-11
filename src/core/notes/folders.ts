import { type Host, HostError } from "../../host/host";
import { fileNameFor, safeName } from "../file-name/file-name";
import { isInsideVaultOps } from "../vault/vault";
import {
	checkFolderDepth,
	checkVaultPath,
	FOLDER_DEPTH_NOTICE,
	folderDepth,
	MAX_FOLDER_DEPTH,
	nameKey,
} from "../vault-path/vault-path";

export interface FolderResult {
	/** Where the folder is now (the old path when nothing happened). */
	path: string;
	/** True only when something changed on disk. */
	changed: boolean;
	/** Plain-words message for the person when something did not go through. */
	notice?: string;
}

const NO_NAME = "New folder";

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
 * The rule for a folder name typed into the tree, so the field can say so
 * before anything is made. The name is cleaned the way `createFolder` and
 * `renameFolder` clean it, then compared with the other folders in the same
 * place the way the Mac compares names (capital letters and Unicode form are
 * ignored). Returns a plain-words problem, or null when the name is fine.
 * An empty name is fine (a new folder becomes "New folder"). The functions
 * above still give a clash the next free name (" 2") as a safety net for
 * drag-and-drop moves and for anything that changed after the check.
 */
export function folderNameProblem(
	name: string,
	otherFolders: Iterable<string>,
): string | null {
	if (name.trim() === "") return null;
	const key = nameKey(safeName(name.trim()));
	for (const other of otherFolders) {
		if (nameKey(other) === key) {
			return `A folder called "${other}" is already here. Pick a different name.`;
		}
	}
	return null;
}

/** A folder path the app may touch: a real path outside `.vaultops/`, not the root. */
function usable(path: string): boolean {
	return path !== "" && checkVaultPath(path).ok && !isInsideVaultOps(path);
}

/** A place a folder may go: the root, or a real folder outside `.vaultops/`. */
async function destinationProblem(
	host: Host,
	folder: string,
): Promise<string | null> {
	if (
		!checkVaultPath(folder, { allowRoot: true }).ok ||
		isInsideVaultOps(folder)
	) {
		return "Folders can't go in there.";
	}
	if (folder !== "" && (await host.kindOf(folder)) !== "folder") {
		return "That folder does not exist.";
	}
	return null;
}

/** Levels in a folder's own tree, counting the folder itself: an empty folder is 1. */
async function folderHeight(
	host: Host,
	path: string,
	guard = 64,
): Promise<number> {
	if (guard <= 0) return 1;
	let deepest = 0;
	for (const entry of await host.list(path)) {
		if (entry.kind === "folder") {
			deepest = Math.max(
				deepest,
				await folderHeight(host, join(path, entry.name), guard - 1),
			);
		}
	}
	return 1 + deepest;
}

/**
 * Make a folder inside `parent` ("" is the vault root). The name is cleaned
 * the same way note names are (`a/b` becomes `a-b`, a leading dot goes) and,
 * if it is taken there, gets " 2", " 3", and so on, compared the way the Mac
 * does. An empty name becomes "New folder".
 */
export async function createFolder(
	host: Host,
	parent: string,
	name: string,
): Promise<FolderResult> {
	const refuse = (notice: string): FolderResult => ({
		path: parent,
		changed: false,
		notice,
	});
	const problem = await destinationProblem(host, parent);
	if (problem) return refuse(problem);
	if (!checkFolderDepth(join(parent, "x")).ok) {
		return refuse(FOLDER_DEPTH_NOTICE);
	}
	const existing = (await host.list(parent)).map((entry) => entry.name);
	const target = fileNameFor(name.trim() === "" ? NO_NAME : name, existing, "");
	const path = join(parent, target);
	try {
		await host.makeFolder(path);
	} catch (error) {
		return refuse(`The folder could not be made (${message(error)}).`);
	}
	return { path, changed: true };
}

/**
 * Rename a folder. The new name is cleaned like a note name and made unique
 * among its neighbours; a change of capital letters only is allowed. Its
 * contents move with it.
 */
export async function renameFolder(
	host: Host,
	path: string,
	newName: string,
): Promise<FolderResult> {
	const refuse = (notice: string): FolderResult => ({
		path,
		changed: false,
		notice,
	});
	if (!usable(path)) return refuse("That folder can't be renamed.");
	if ((await host.kindOf(path)) !== "folder") {
		return refuse("That folder does not exist.");
	}
	const { folder, name } = split(path);
	const others = (await host.list(folder))
		.map((entry) => entry.name)
		.filter((entry) => entry !== name);
	const target = fileNameFor(
		newName.trim() === "" ? NO_NAME : newName,
		others,
		"",
	);
	if (target === name) return { path, changed: false };
	const newPath = join(folder, target);
	try {
		await host.move(path, newPath);
	} catch (error) {
		return refuse(`The folder could not be renamed (${message(error)}).`);
	}
	return { path: newPath, changed: true };
}

/**
 * Move a folder, with everything in it, into another folder ("" is the vault
 * root). It keeps its name or, if that is taken there, takes the next free
 * one. A folder can't go into itself or anything inside itself, and it can't
 * go where its deepest subfolder would end up more than `MAX_FOLDER_DEPTH`
 * levels down (unless that tree was already that deep: it may be moved
 * around, just not made deeper).
 */
export async function moveFolder(
	host: Host,
	path: string,
	into: string,
): Promise<FolderResult> {
	const refuse = (notice: string): FolderResult => ({
		path,
		changed: false,
		notice,
	});
	if (!usable(path)) return refuse("That folder can't be moved.");
	if ((await host.kindOf(path)) !== "folder") {
		return refuse("That folder does not exist.");
	}
	const problem = await destinationProblem(host, into);
	if (problem) return refuse(problem);
	const here = nameKey(path);
	const there = nameKey(into);
	if (there === here || there.startsWith(`${here}/`)) {
		return refuse("A folder can't be moved into itself.");
	}
	const { folder: from, name } = split(path);
	if (nameKey(from) === there) return { path, changed: false };

	const height = await folderHeight(host, path);
	const deepestBefore = folderDepth(path) + height - 1;
	const deepestAfter = folderDepth(into) + height;
	if (deepestAfter > MAX_FOLDER_DEPTH && deepestAfter > deepestBefore) {
		return refuse(FOLDER_DEPTH_NOTICE);
	}

	const existing = (await host.list(into)).map((entry) => entry.name);
	const taken = existing.some((entry) => nameKey(entry) === nameKey(name));
	const target = taken ? fileNameFor(name, existing, "") : name;
	const newPath = join(into, target);
	try {
		await host.move(path, newPath);
	} catch (error) {
		return refuse(`The folder could not be moved (${message(error)}).`);
	}
	return { path: newPath, changed: true };
}

/** Whether `path` is `folder` itself or something inside it (names compared the Mac's way). */
export function within(path: string, folder: string): boolean {
	const p = path.split("/");
	const f = folder.split("/");
	return (
		p.length >= f.length &&
		f.every((part, i) => nameKey(part) === nameKey(p[i] ?? ""))
	);
}

/**
 * Where `path` ends up after `from` (a folder or a note) was moved or renamed
 * to `to`: `from` itself and anything inside it follow, anything else stays.
 */
export function movedPath(path: string, from: string, to: string): string {
	if (!within(path, from)) return path;
	return [to, ...path.split("/").slice(from.split("/").length)].join("/");
}
