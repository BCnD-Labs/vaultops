import type { Host } from "../../host/host";
import { fileNameFor, NOTE_EXT } from "../file-name/file-name";
import { isInsideVaultOps } from "../vault/vault";
import { checkVaultPath, nameKey } from "../vault-path/vault-path";

const TRASH = ".vaultops/trash";

export interface TrashedNote {
	/** Where the file sits now, inside the trash folder. */
	trashPath: string;
	/** Where it was before it was deleted. */
	originalPath: string;
	/** When it was deleted (null if the folder name isn't a time). */
	deletedAt: Date | null;
}

/** UTC time with no colons, e.g. 2026-10-27T15-04-05-123Z. */
function stamp(now: Date): string {
	return now.toISOString().replace(/[:.]/g, "-");
}

function parseStamp(name: string): Date | null {
	const m = /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z/.exec(name);
	if (!m) return null;
	const date = new Date(`${m[1]}T${m[2]}:${m[3]}:${m[4]}.${m[5]}Z`);
	return Number.isNaN(date.getTime()) ? null : date;
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

/**
 * Move a note to `.vaultops/trash/<time>/<its path>`. Nothing is erased, and a
 * path inside `.vaultops/` is refused. Returns where the note went.
 */
export async function trashNote(
	host: Host,
	path: string,
	now: Date = new Date(),
): Promise<{ trashPath: string }> {
	if (!checkVaultPath(path).ok || isInsideVaultOps(path)) {
		throw new Error("That file can't be moved to the trash.");
	}
	if ((await host.kindOf(path)) !== "file") {
		throw new Error("That note was not found.");
	}
	await host.makeFolder(TRASH);
	const base = stamp(now);
	let folder = `${TRASH}/${base}`;
	for (let n = 2; (await host.kindOf(folder)) !== null; n++) {
		folder = `${TRASH}/${base} ${n}`;
	}
	const target = join(folder, path);
	await host.makeFolder(split(target).folder);
	await host.move(path, target);
	return { trashPath: target };
}

async function filesUnder(host: Host, folder: string): Promise<string[]> {
	const found: string[] = [];
	for (const entry of await host.list(folder)) {
		const path = `${folder}/${entry.name}`;
		if (entry.kind === "folder") found.push(...(await filesUnder(host, path)));
		else found.push(path);
	}
	return found;
}

/** Every trashed note with its original path and deletion time, newest first. */
export async function listTrash(host: Host): Promise<TrashedNote[]> {
	if ((await host.kindOf(TRASH)) !== "folder") return [];
	const stamps = (await host.list(TRASH))
		.filter((entry) => entry.kind === "folder")
		.map((entry) => entry.name)
		.sort()
		.reverse();
	const out: TrashedNote[] = [];
	for (const name of stamps) {
		const root = `${TRASH}/${name}`;
		const deletedAt = parseStamp(name);
		for (const file of (await filesUnder(host, root)).sort()) {
			out.push({
				trashPath: file,
				originalPath: file.slice(root.length + 1),
				deletedAt,
			});
		}
	}
	return out;
}

/**
 * Put a trashed note back at its original path. A missing folder means the
 * vault root; a taken name gets " 2", " 3" (compared the way the Mac does).
 */
export async function restoreNote(
	host: Host,
	trashPath: string,
): Promise<{ path: string }> {
	const parts = trashPath.split("/");
	const inTrash =
		checkVaultPath(trashPath).ok &&
		nameKey(parts.slice(0, 2).join("/")) === nameKey(TRASH) &&
		parts.length >= 4;
	if (!inTrash || (await host.kindOf(trashPath)) !== "file") {
		throw new Error("That item is not in the trash.");
	}
	const original = parts.slice(3).join("/");
	const { folder, name } = split(original);
	const folderOk =
		folder !== "" &&
		!isInsideVaultOps(folder) &&
		(await host.kindOf(folder)) === "folder";
	const dest = folderOk ? folder : "";
	const taken = (await host.list(dest)).map((entry) => entry.name);
	const clash = taken.some((t) => nameKey(t) === nameKey(name));
	const ext = name.toLowerCase().endsWith(NOTE_EXT)
		? name.slice(-NOTE_EXT.length)
		: "";
	const target = clash
		? fileNameFor(name.slice(0, name.length - ext.length), taken, ext)
		: name;
	const path = join(dest, target);
	await host.move(trashPath, path);
	return { path };
}
