/**
 * Vault-relative paths: the only kind of path app code passes to the host.
 * Forward slashes, no leading slash, no `.` or `..`, no empty parts,
 * no control characters, no backslashes, each part at most 255 UTF-8 bytes,
 * and never the `.git` folder (any capitalization).
 * The vault root is the empty string and is only accepted where allowed.
 */

/**
 * How deep a folder may sit below the vault root (Blake's rule): `A/B/C/D/E`
 * is the deepest allowed folder. This limits what the app *makes* (new
 * folders, folders moved deeper); it is not part of `checkVaultPath`, so
 * folders that are already deeper still open and list as before. Notes do not
 * count: a note may sit in a folder at the limit.
 */
export const MAX_FOLDER_DEPTH = 5;

export type PathCheck =
	| { ok: true; path: string; parts: string[] }
	| { ok: false; reason: string };

const MAX_PART_BYTES = 255;
// biome-ignore lint/suspicious/noControlCharactersInRegex: rejecting them is the point.
const CONTROL = /[\u0000-\u001f\u007f]/;

export function checkVaultPath(
	path: string,
	options: { allowRoot?: boolean } = {},
): PathCheck {
	if (path === "") {
		return options.allowRoot
			? { ok: true, path, parts: [] }
			: { ok: false, reason: "path is empty" };
	}
	if (path.startsWith("/")) return { ok: false, reason: "path is absolute" };
	if (path.includes("\\")) return { ok: false, reason: "path has a backslash" };
	if (CONTROL.test(path))
		return { ok: false, reason: "path has a control character" };
	const parts = path.split("/");
	for (const part of parts) {
		if (part === "") return { ok: false, reason: "path has an empty part" };
		if (part === "." || part === "..")
			return { ok: false, reason: "path has a . or .. part" };
		if (new TextEncoder().encode(part).length > MAX_PART_BYTES)
			return { ok: false, reason: "a path part is longer than 255 bytes" };
		if (part.toLowerCase() === ".git")
			return { ok: false, reason: "the .git folder is off limits" };
	}
	return { ok: true, path, parts };
}

/**
 * The key two names share when the Mac treats them as the same file:
 * Unicode-normalized (NFC) and case-folded. An approximation of APFS
 * case-insensitive matching that covers ASCII and common accented letters.
 */
export function nameKey(name: string): string {
	return name.normalize("NFC").toLowerCase();
}

export function pathKey(parts: string[]): string {
	return parts.map(nameKey).join("/");
}

export function parentParts(parts: string[]): string[] {
	return parts.slice(0, -1);
}

/** How many folders deep a folder path is: "" is 0, "A" is 1, "A/B" is 2. */
export function folderDepth(path: string): number {
	return path === "" ? 0 : path.split("/").length;
}

/** The refusal shown when a folder would go deeper than `MAX_FOLDER_DEPTH`. */
export const FOLDER_DEPTH_NOTICE = `Folders can go at most ${MAX_FOLDER_DEPTH} levels deep, so that was not done.`;

/** Whether the folder at `path` is within the depth limit. Only for folders the app is about to make. */
export function checkFolderDepth(
	path: string,
): { ok: true } | { ok: false; reason: string } {
	return folderDepth(path) <= MAX_FOLDER_DEPTH
		? { ok: true }
		: { ok: false, reason: FOLDER_DEPTH_NOTICE };
}
