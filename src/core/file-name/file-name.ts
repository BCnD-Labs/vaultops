import { checkVaultPath, nameKey } from "../vault-path/vault-path";

/** File extension for notes. */
export const NOTE_EXT = ".vnote";

const MAX_CHARS = 120;
const MAX_BYTES = 255;
// Room kept for a clash suffix up to " 99" when cutting a long title.
const SUFFIX_ROOM = " 99";
// biome-ignore lint/suspicious/noControlCharactersInRegex: replacing them is the point.
const UNSAFE = /[/:\\\u0000-\u001f\u007f]/g;
const EDGES = /^[.\s]+|[.\s]+$/g;

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const encoder = new TextEncoder();
const bytes = (s: string) => encoder.encode(s).length;

/** Cut to whole characters (as people see them: emoji, accents) until `fits`. */
function cutToFit(text: string, fits: (s: string) => boolean): string {
	const parts = [...graphemes.segment(text)].map((g) => g.segment);
	while (parts.length > 0 && !fits(parts.join(""))) parts.pop();
	return parts.join("");
}

/**
 * A safe name for a file or folder from a title: `/`, `:`, `\\` and control
 * characters become `-` (the vault path rules refuse a backslash), leading
 * and trailing dots and spaces are removed, empty becomes "Untitled", and
 * long names are cut to at most 120 characters with room left for a " 99"
 * clash suffix and the extension under 255 bytes.
 */
export function safeName(title: string, ext = ""): string {
	let name = title.normalize("NFC").replace(UNSAFE, "-").replace(EDGES, "");
	const budget = MAX_BYTES - bytes(SUFFIX_ROOM) - bytes(ext);
	name = cutToFit(
		name,
		(s) => [...graphemes.segment(s)].length <= MAX_CHARS && bytes(s) <= budget,
	);
	name = name.replace(EDGES, "");
	return name === "" ? "Untitled" : name;
}

/**
 * The file name for a note with this title, unique in its folder.
 * `existingNames` are the names already in the folder; a clash is checked the
 * way the Mac compares names (ignoring capital letters and Unicode form) and
 * gets " 2", " 3", and so on.
 */
export function fileNameFor(
	title: string,
	existingNames: Iterable<string>,
	ext = NOTE_EXT,
): string {
	const taken = new Set([...existingNames].map(nameKey));
	const base = safeName(title, ext);
	for (let n = 1; ; n++) {
		const suffix = n === 1 ? "" : ` ${n}`;
		const budget = MAX_BYTES - bytes(suffix) - bytes(ext);
		const stem =
			cutToFit(base, (s) => bytes(s) <= budget).replace(EDGES, "") ||
			"Untitled";
		const candidate = `${stem}${suffix}${ext}`;
		if (!taken.has(nameKey(candidate))) {
			if (!checkVaultPath(candidate).ok)
				throw new Error("file name broke the path rules");
			return candidate;
		}
	}
}
