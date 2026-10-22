export const NOTE_FORMAT = "vaultops-note";
export const NOTE_FORMAT_VERSION = 1;

export type JsonValue =
	| null
	| boolean
	| number
	| string
	| JsonValue[]
	| { [k: string]: JsonValue };

export interface NoteHeader {
	format: typeof NOTE_FORMAT;
	v: number;
	noteId: string;
	[k: string]: JsonValue;
}

export interface Block {
	id?: string;
	type: string;
	parent: string | null;
	[k: string]: JsonValue | undefined;
}

export interface Note {
	header: NoteHeader;
	blocks: Block[];
}

export type ProblemKind =
	| "invalid-json"
	| "bad-header"
	| "bad-block"
	| "missing-id"
	| "duplicate-id"
	| "inline-id"
	| "orphan-parent"
	| "newer-version";

export interface Problem {
	kind: ProblemKind;
	/** 1-based line number. */
	line: number;
	blockId?: string;
	message: string;
}

export interface ParseResult {
	note: Note | null;
	skippedLines: number[];
	problems: Problem[];
}

type Obj = { [k: string]: unknown };

function isObject(value: unknown): value is Obj {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Compare strings by Unicode code point (not UTF-16 code unit). */
function compareCodePoints(a: string, b: string): number {
	const ia = a[Symbol.iterator]();
	const ib = b[Symbol.iterator]();
	for (;;) {
		const ra = ia.next();
		const rb = ib.next();
		if (ra.done || rb.done) {
			if (ra.done && rb.done) return 0;
			return ra.done ? -1 : 1;
		}
		const ca = ra.value.codePointAt(0) ?? 0;
		const cb = rb.value.codePointAt(0) ?? 0;
		if (ca !== cb) return ca < cb ? -1 : 1;
	}
}

// Strings are built by hand (not via object key order) because JS objects
// reorder integer-like keys, which would break canonical ordering.
function stringifyEntries(entries: [string, unknown][]): string {
	const parts: string[] = [];
	for (const [key, value] of entries) {
		if (value === undefined) continue;
		parts.push(`${JSON.stringify(key)}:${stringifyValue(value)}`);
	}
	return `{${parts.join(",")}}`;
}

function sortedEntries(obj: Obj): [string, unknown][] {
	return Object.keys(obj)
		.sort(compareCodePoints)
		.map((k) => [k, obj[k]]);
}

function stringifyValue(value: unknown): string {
	if (Array.isArray(value)) {
		return `[${value.map((v) => (v === undefined ? "null" : stringifyValue(v))).join(",")}]`;
	}
	if (isObject(value)) return stringifyEntries(sortedEntries(value));
	return JSON.stringify(value) ?? "null";
}

function stringifyWithLead(obj: Obj, lead: string[]): string {
	const entries: [string, unknown][] = [];
	for (const key of lead) {
		if (Object.hasOwn(obj, key)) entries.push([key, obj[key]]);
	}
	const rest = sortedEntries(obj).filter(([k]) => !lead.includes(k));
	return stringifyEntries([...entries, ...rest]);
}

export function serializeNote(note: Note): string {
	const lines = [stringifyWithLead(note.header, ["format", "v", "noteId"])];
	for (const block of note.blocks) {
		lines.push(stringifyWithLead(block, ["id", "type", "parent"]));
	}
	return `${lines.join("\n")}\n`;
}

function collectInlineIds(
	value: unknown,
	path: string,
	out: string[],
	isAttrs = false,
): void {
	if (Array.isArray(value)) {
		value.forEach((v, i) => {
			collectInlineIds(v, `${path}[${i}]`, out);
		});
		return;
	}
	if (!isObject(value)) return;
	const attrs = value["attrs"];
	// An attrs object is reported via its owner, not a second time itself.
	if (
		!isAttrs &&
		(Object.hasOwn(value, "id") ||
			(isObject(attrs) && Object.hasOwn(attrs, "id")))
	) {
		out.push(path);
	}
	for (const [k, v] of Object.entries(value)) {
		collectInlineIds(v, `${path}.${k}`, out, k === "attrs");
	}
}

/**
 * Report id and tree problems without changing anything.
 * `lineNumbers[i]` is the file line of `note.blocks[i]`; when omitted, lines
 * count from the block order (header = 1, first block = 2).
 */
export function findIdProblems(note: Note, lineNumbers?: number[]): Problem[] {
	const problems: Problem[] = [];
	const seen = new Set<string>();
	note.blocks.forEach((block, index) => {
		const line = lineNumbers?.[index] ?? index + 2;
		const id = block.id;
		const validId = typeof id === "string" && id !== "" ? id : undefined;
		const base = validId === undefined ? {} : { blockId: validId };

		if (validId === undefined) {
			problems.push({
				kind: "missing-id",
				line,
				message: "block has no non-empty string id",
			});
		} else if (seen.has(validId)) {
			problems.push({
				kind: "duplicate-id",
				line,
				...base,
				message: `duplicate block id ${validId}`,
			});
		}

		const paths: string[] = [];
		collectInlineIds(block["content"], "content", paths);
		for (const path of paths) {
			problems.push({
				kind: "inline-id",
				line,
				...base,
				message: `inline node has an id at ${path}`,
			});
		}

		if (block.parent !== null && !seen.has(block.parent)) {
			problems.push({
				kind: "orphan-parent",
				line,
				...base,
				message: `parent ${block.parent} does not appear on an earlier line`,
			});
		}

		if (validId !== undefined) seen.add(validId);
	});
	return problems;
}

export function parseNote(text: string): ParseResult {
	const problems: Problem[] = [];
	const skippedLines: number[] = [];
	const lines = text.split("\n");
	if (lines[lines.length - 1] === "") lines.pop();

	const badHeader = (message: string): ParseResult => ({
		note: null,
		skippedLines,
		problems: [...problems, { kind: "bad-header", line: 1, message }],
	});

	const first = lines[0];
	if (first === undefined) return badHeader("file is empty");
	let headerRaw: unknown;
	try {
		headerRaw = JSON.parse(first);
	} catch {
		return badHeader("header line is not valid JSON");
	}
	if (!isObject(headerRaw) || headerRaw["format"] !== NOTE_FORMAT) {
		return badHeader(`header is not a ${NOTE_FORMAT} object`);
	}
	if (typeof headerRaw["v"] !== "number") {
		return badHeader("header v is not a number");
	}
	if (typeof headerRaw["noteId"] !== "string") {
		return badHeader("header noteId is not a string");
	}
	const header = headerRaw as unknown as NoteHeader;

	if (header.v > NOTE_FORMAT_VERSION) {
		problems.push({
			kind: "newer-version",
			line: 1,
			message: `note version ${header.v} is newer than supported version ${NOTE_FORMAT_VERSION}`,
		});
	}

	const blocks: Block[] = [];
	const blockLines: number[] = [];
	for (let i = 1; i < lines.length; i++) {
		const line = i + 1;
		let value: unknown;
		try {
			value = JSON.parse(lines[i] ?? "");
		} catch {
			skippedLines.push(line);
			problems.push({
				kind: "invalid-json",
				line,
				message: "line is empty or not valid JSON",
			});
			continue;
		}
		if (
			!isObject(value) ||
			typeof value["type"] !== "string" ||
			!(value["parent"] === null || typeof value["parent"] === "string")
		) {
			skippedLines.push(line);
			problems.push({
				kind: "bad-block",
				line,
				message:
					"block must be an object with a string type and a string or null parent",
			});
			continue;
		}
		blocks.push(value as unknown as Block);
		blockLines.push(line);
	}

	const note: Note = { header, blocks };
	problems.push(...findIdProblems(note, blockLines));
	return { note, skippedLines, problems };
}
