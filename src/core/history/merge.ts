/**
 * Three-way merge of a note, block by block (pure). Used when merging a
 * branch, and later for sync. Given the common `base` and two edited copies,
 * `mine` (the copy being merged into) and `theirs`:
 *
 * - The header: the title and each property merge on their own. A change on
 *   one side wins; both sides changing the same value differently keeps mine
 *   and records a conflict. List properties (such as tags) merge as sets:
 *   additions and removals from both sides all apply.
 * - Blocks are matched by their stable `id`. A block changed on one side takes
 *   that side; changed on both sides, each field merges on its own (so one side
 *   retyping and the other editing the text combine).
 * - The same field changed on both sides keeps mine, and theirs is placed right
 *   after it inside a yellow callout ("Also changed on <label>"), so no text
 *   from either side is ever dropped.
 * - A block deleted on one side and edited on the other is kept.
 * - The order follows mine; blocks only theirs has go after their nearest
 *   neighbour from theirs. A block whose parent is gone moves to the top level.
 *
 * Moves made only in theirs (a new place among the same siblings) don't carry
 * over; text is never lost by it. A word-level merge of a paragraph edited on
 * both sides waits for the word-diff library (#154); until then both versions
 * are kept as above.
 */
import type { Block, JsonValue, Note, NoteHeader } from "../note-format";

export type MergeConflict =
	| { kind: "title"; mine: string; theirs: string }
	| { kind: "property"; name: string; mine: JsonValue; theirs: JsonValue }
	| { kind: "block"; id: string; calloutId: string }
	| { kind: "kept-edited"; id: string };

export interface MergeResult {
	note: Note;
	/** What needed a choice; empty when everything combined cleanly. */
	conflicts: MergeConflict[];
}

export interface MergeOptions {
	/** Names the other side in conflict callouts, such as a branch name. */
	theirsLabel: string;
	/** Makes ids for conflict callouts; tests pass a fixed one. */
	newId?: () => string;
}

type Obj = { [k: string]: JsonValue };

const isObj = (v: unknown): v is Obj =>
	typeof v === "object" && v !== null && !Array.isArray(v);

/** Stable text for comparing values: object keys sorted at every level. */
export function stable(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
	if (isObj(value))
		return `{${Object.keys(value)
			.sort()
			.filter((k) => value[k] !== undefined)
			.map((k) => `${JSON.stringify(k)}:${stable(value[k])}`)
			.join(",")}}`;
	return JSON.stringify(value) ?? "undefined";
}

const same = (a: unknown, b: unknown) => stable(a) === stable(b);

/** Three-way pick: the side that changed, or null when both changed differently. */
function pick<T>(
	base: T | undefined,
	mine: T | undefined,
	theirs: T | undefined,
) {
	if (same(mine, theirs)) return { value: mine, clash: false };
	if (same(mine, base)) return { value: theirs, clash: false };
	if (same(theirs, base)) return { value: mine, clash: false };
	return { value: mine, clash: true };
}

const strings = (v: unknown): string[] | null =>
	Array.isArray(v) && v.every((x) => typeof x === "string") ? v : null;

/** Lists merge as sets: base, plus what either added, minus what either removed. */
function mergeList(base: string[], mine: string[], theirs: string[]): string[] {
	const key = (s: string) => s.toLowerCase();
	const has = (list: string[], s: string) =>
		list.some((x) => key(x) === key(s));
	const removed = (side: string[]) => base.filter((b) => !has(side, b));
	const gone = [...removed(mine), ...removed(theirs)];
	const out: string[] = [];
	for (const item of [...mine, ...theirs]) {
		if (has(gone, item) || has(out, item)) continue;
		out.push(item);
	}
	return out;
}

function mergeEntry(
	name: string,
	base: JsonValue | undefined,
	mine: JsonValue | undefined,
	theirs: JsonValue | undefined,
	conflicts: MergeConflict[],
): JsonValue | undefined {
	// Both sides kept a list property and changed its items: merge the items.
	if (isObj(base) && isObj(mine) && isObj(theirs)) {
		const lists = [base.value, mine.value, theirs.value].map(strings);
		if (
			lists.every((l) => l !== null) &&
			same({ ...mine, value: 0 }, { ...theirs, value: 0 })
		) {
			const [b, m, t] = lists as string[][];
			return {
				...mine,
				value: mergeList(b as string[], m as string[], t as string[]),
			};
		}
	}
	const { value, clash } = pick(base, mine, theirs);
	// Deleted on one side and changed on the other: keep the changed value.
	if (!clash && value === undefined && mine !== undefined && !same(mine, base))
		return mine;
	if (
		!clash &&
		value === undefined &&
		theirs !== undefined &&
		!same(theirs, base)
	)
		return theirs;
	if (clash)
		conflicts.push({
			kind: "property",
			name,
			mine: mine ?? null,
			theirs: theirs ?? null,
		});
	return value;
}

function mergeProps(
	base: JsonValue | undefined,
	mine: JsonValue | undefined,
	theirs: JsonValue | undefined,
	conflicts: MergeConflict[],
): Obj | undefined {
	const b = isObj(base) ? base : {};
	const m = isObj(mine) ? mine : {};
	const t = isObj(theirs) ? theirs : {};
	// Names match ignoring capitals, like everywhere else; mine's spelling wins.
	const names = new Map<string, string>();
	for (const k of [...Object.keys(m), ...Object.keys(t), ...Object.keys(b)])
		if (!names.has(k.toLowerCase())) names.set(k.toLowerCase(), k);
	const find = (o: Obj, lower: string) =>
		o[Object.keys(o).find((k) => k.toLowerCase() === lower) ?? ""];
	const out: Obj = {};
	for (const [lower, name] of names) {
		const v = mergeEntry(
			name,
			find(b, lower),
			find(m, lower),
			find(t, lower),
			conflicts,
		);
		if (v !== undefined) out[name] = v;
	}
	return Object.keys(out).length > 0 || isObj(mine) || isObj(theirs)
		? out
		: undefined;
}

function mergeHeader(
	base: NoteHeader | null,
	mine: NoteHeader,
	theirs: NoteHeader,
	conflicts: MergeConflict[],
): NoteHeader {
	const out: Obj = { format: mine.format, v: mine.v, noteId: mine.noteId };
	const keys = new Set([
		...Object.keys(mine),
		...Object.keys(theirs),
		...Object.keys(base ?? {}),
	]);
	for (const key of keys) {
		if (key === "format" || key === "v" || key === "noteId") continue;
		if (key === "props") {
			const props = mergeProps(
				base?.props,
				mine.props,
				theirs.props,
				conflicts,
			);
			if (props !== undefined) out.props = props;
			continue;
		}
		const { value, clash } = pick(base?.[key], mine[key], theirs[key]);
		if (clash && key === "title")
			conflicts.push({
				kind: "title",
				mine: String(mine.title ?? ""),
				theirs: String(theirs.title ?? ""),
			});
		if (value !== undefined) out[key] = value;
	}
	return out as NoteHeader;
}

/** A block's fields merged one by one; null when a field changed differently on both sides. */
function mergeFields(
	base: Block | undefined,
	mine: Block,
	theirs: Block,
): Block | null {
	if (!base) return null;
	const out: Obj = {};
	const keys = new Set([
		...Object.keys(mine),
		...Object.keys(theirs),
		...Object.keys(base),
	]);
	for (const key of keys) {
		const { value, clash } = pick(base[key], mine[key], theirs[key]);
		if (clash) return null;
		if (value !== undefined) out[key] = value;
	}
	return out as Block;
}

/** Merge three versions of a note. `base` is null when the note was added on both sides. */
export function mergeNotes(
	base: Note | null,
	mine: Note,
	theirs: Note,
	options: MergeOptions,
): MergeResult {
	const newId = options.newId ?? (() => crypto.randomUUID());
	const conflicts: MergeConflict[] = [];
	const header = mergeHeader(
		base?.header ?? null,
		mine.header,
		theirs.header,
		conflicts,
	);

	const byId = (note: Note | null) =>
		new Map(
			(note?.blocks ?? []).filter((b) => b.id).map((b) => [b.id as string, b]),
		);
	const B = byId(base);
	const M = byId(mine);
	const T = byId(theirs);

	// Decide each block: the merged block, or nothing when deleted.
	const result = new Map<string, Block>();
	const calloutsAfter = new Map<string, Block[]>();
	for (const id of new Set([...M.keys(), ...T.keys()])) {
		const b = B.get(id);
		const m = M.get(id);
		const t = T.get(id);
		if (m && t) {
			if (same(m, t) || same(t, b)) result.set(id, m);
			else if (same(m, b)) result.set(id, t);
			else {
				const merged = mergeFields(b, m, t);
				if (merged) result.set(id, merged);
				else {
					result.set(id, m);
					const calloutId = newId();
					conflicts.push({ kind: "block", id, calloutId });
					calloutsAfter.set(id, [
						{
							id: calloutId,
							type: "callout",
							parent: m.parent,
							attrs: { color: "yellow" },
						},
						{
							id: newId(),
							type: "paragraph",
							parent: calloutId,
							content: [
								{
									type: "text",
									text: `Also changed on ${options.theirsLabel}:`,
								},
							],
						},
						{ ...t, id: newId(), parent: calloutId },
					]);
				}
			}
		} else if (m) {
			// Only mine has it: added here, or deleted there.
			if (!b) result.set(id, m);
			else if (!same(m, b)) {
				result.set(id, m);
				conflicts.push({ kind: "kept-edited", id });
			}
		} else if (t) {
			if (!b) result.set(id, t);
			else if (!same(t, b)) {
				result.set(id, t);
				conflicts.push({ kind: "kept-edited", id });
			}
		}
	}

	// Order: mine's, then blocks only theirs placed after their neighbour in theirs.
	const order: string[] = mine.blocks.flatMap((b) =>
		b.id && result.has(b.id) ? [b.id] : [],
	);
	const placed = new Set(order);
	theirs.blocks.forEach((block, index) => {
		const id = block.id;
		if (!id || placed.has(id) || !result.has(id)) return;
		let anchor: string | null = null;
		for (let i = index - 1; i >= 0; i--) {
			const before = theirs.blocks[i]?.id;
			if (before && placed.has(before)) {
				anchor = before;
				break;
			}
		}
		const at = anchor === null ? 0 : order.indexOf(anchor) + 1;
		order.splice(at, 0, id);
		placed.add(id);
	});

	const blocks: Block[] = [];
	for (const id of order) {
		const block = result.get(id) as Block;
		blocks.push(block);
		blocks.push(...(calloutsAfter.get(id) ?? []));
	}
	// Blocks without ids in mine stay where mine had them at the end (rare; kept, never dropped).
	for (const block of mine.blocks) if (!block.id) blocks.push(block);
	const ids = new Set(blocks.map((b) => b.id));
	const fixed = blocks.map((block) =>
		block.parent !== null && !ids.has(block.parent)
			? { ...block, parent: null }
			: block,
	);
	return { note: { header, blocks: fixed }, conflicts };
}
