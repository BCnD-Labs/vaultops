/**
 * Vault-relative paths: the only kind of path app code passes to the host.
 * Forward slashes, no leading slash, no `.` or `..`, no empty parts,
 * no control characters, no backslashes, each part at most 255 UTF-8 bytes.
 * The vault root is the empty string and is only accepted where allowed.
 */

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
