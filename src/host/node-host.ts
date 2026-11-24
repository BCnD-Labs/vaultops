import { Buffer, isUtf8 } from "node:buffer";
import { constants, type Stats } from "node:fs";
import { lstat, open, readdir, readlink, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, win32 } from "node:path";
import { platform } from "node:process";
import { isInsideVaultOps } from "../core/vault/vault";
import { checkVaultPath } from "../core/vault-path/vault-path";
import { type DirEntry, HostError, type VaultReadHost } from "./host";

const TEMP_PREFIX = ".vaultops-tmp-";
const utf8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
// Darwin's O_NOFOLLOW_ANY stops a symlink swap at any path component;
// Node exposes only O_NOFOLLOW, which applies to the final component.
const NOFOLLOW = platform === "darwin" ? 0x20000000 : constants.O_NOFOLLOW;

const invalidPath = () =>
	new HostError("invalid-path", "Not a safe vault-relative path.");

function hostError(error: unknown): HostError {
	if (error instanceof HostError) return error;
	const code = (error as NodeJS.ErrnoException)?.code;
	if (code === "ENOENT") return new HostError("not-found", "Path not found.");
	if (code === "ENOTDIR")
		return new HostError("not-a-folder", "Path is not a folder.");
	if (code === "ELOOP") return invalidPath();
	return new HostError("io", "The vault path could not be read.");
}

function sameEntry(first: Stats, second: Stats): boolean {
	return first.dev === second.dev && first.ino === second.ino;
}

/**
 * Open the folder set by the local client. Tool callers only supply relative paths.
 * STOPGAP(node-vault-read): use the native directory-handle sandbox for a public server.
 */
export async function openNodeHost(folder: string): Promise<VaultReadHost> {
	let root: string;
	let rootStats: Stats;
	try {
		root = await realpath(folder);
		rootStats = await lstat(root);
		if (!rootStats.isDirectory())
			throw new HostError("not-a-folder", "The vault is not a folder.");
	} catch (error) {
		throw hostError(error);
	}

	async function resolve(path: string, allowRoot = false) {
		const checked = checkVaultPath(path, { allowRoot });
		if (!checked.ok || isAbsolute(path) || win32.isAbsolute(path))
			throw invalidPath();
		let links = 0;
		const internal = isInsideVaultOps(path);

		async function walk(parts: string[], from: string[], start: Stats) {
			let resolved = [...from];
			let stats = start;
			for (const part of parts) {
				if (!stats.isDirectory())
					throw new HostError("not-a-folder", "Path is not a folder.");
				if (part === "" || part === ".") continue;
				if (part === "..") {
					if (!resolved.length) throw invalidPath();
					resolved.pop();
					stats = await lstat(join(root, ...resolved));
					continue;
				}
				const next = [...resolved, part];
				if (
					!checkVaultPath(part).ok ||
					isInsideVaultOps(next.join("/")) !== internal
				)
					throw invalidPath();
				const filename = join(root, ...next);
				const entry = await lstat(filename);
				if (!entry.isSymbolicLink()) {
					resolved = next;
					stats = entry;
					continue;
				}
				// Reserved app data is addressed by the resource helpers using fixed paths.
				if (internal || ++links > 40) throw invalidPath();
				const target = await readlink(filename);
				if (
					isAbsolute(target) ||
					win32.isAbsolute(target) ||
					target.includes("\\")
				)
					throw invalidPath();
				try {
					({ resolved, stats } = await walk(
						target.split("/"),
						resolved,
						stats,
					));
				} catch (error) {
					const { code } = hostError(error);
					if (code === "not-found" || code === "not-a-folder")
						throw invalidPath();
					throw error;
				}
			}
			return { resolved, stats };
		}

		try {
			const current = await lstat(root);
			if (!sameEntry(current, rootStats)) throw invalidPath();
			const { resolved, stats } = await walk(checked.parts, [], current);
			return { filename: join(root, ...resolved), stats };
		} catch (error) {
			throw hostError(error);
		}
	}

	async function verify(filename: string, stats: Stats) {
		const canonical = await realpath(filename);
		const rel = relative(root, canonical);
		if (
			!checkVaultPath(rel, { allowRoot: true }).ok ||
			isInsideVaultOps(rel) !== isInsideVaultOps(relative(root, filename)) ||
			!sameEntry(await lstat(root), rootStats) ||
			!sameEntry(await lstat(canonical), stats)
		)
			throw invalidPath();
	}

	return {
		async readText(path) {
			const { filename, stats } = await resolve(path);
			if (stats.isDirectory())
				throw new HostError("is-a-folder", "Path is a folder.");
			if (!stats.isFile()) throw invalidPath();
			try {
				const file = await open(filename, NOFOLLOW | constants.O_NONBLOCK);
				try {
					if (!sameEntry(await file.stat(), stats)) throw invalidPath();
					await verify(filename, stats);
					return utf8.decode(await file.readFile());
				} finally {
					await file.close();
				}
			} catch (error) {
				throw hostError(error);
			}
		},
		async list(folder) {
			const { filename, stats } = await resolve(folder, true);
			if (!stats.isDirectory())
				throw new HostError("not-a-folder", "Path is not a folder.");
			try {
				await verify(filename, stats);
				const names = await readdir(filename, {
					encoding: "buffer",
					withFileTypes: true,
				});
				await verify(filename, stats);
				const entries: DirEntry[] = [];
				for (const entry of names) {
					if (!isUtf8(entry.name)) continue;
					const name = entry.name.toString("utf8");
					if (!checkVaultPath(name).ok || name.startsWith(TEMP_PREFIX))
						continue;
					if (entry.isDirectory()) entries.push({ name, kind: "folder" });
					else if (entry.isFile()) entries.push({ name, kind: "file" });
					else if (entry.isSymbolicLink()) {
						// File aliases can be read. Discover folders once, even if linked in a cycle.
						try {
							const path = folder ? `${folder}/${name}` : name;
							if ((await resolve(path)).stats.isFile())
								entries.push({ name, kind: "file" });
						} catch (error) {
							const { code } = hostError(error);
							if (code !== "invalid-path" && code !== "not-found") throw error;
						}
					}
				}
				return entries.sort((a, b) =>
					Buffer.compare(Buffer.from(a.name), Buffer.from(b.name)),
				);
			} catch (error) {
				throw hostError(error);
			}
		},
		async kindOf(path) {
			try {
				const { filename, stats } = await resolve(path, true);
				await verify(filename, stats);
				if (stats.isDirectory()) return "folder";
				return stats.isFile() ? "file" : null;
			} catch (error) {
				const failure = hostError(error);
				if (failure.code === "not-found" || failure.code === "not-a-folder")
					return null;
				throw failure;
			}
		},
	};
}
