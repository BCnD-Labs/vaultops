/**
 * What changed between two versions of a note, in the note's own terms rather
 * than file lines (pure). Blocks are matched by their stable `id`; the header
 * gives the title and each property. Used by the Changes panel, a note's
 * History tab, field history and, later, merging.
 *
 * A version may be null: a note that didn't exist yet (everything added) or
 * was deleted (everything removed). Block types this version doesn't know are
 * compared like any other and summarised as "changed", never an error.
 */
import type { Block, JsonValue, Note } from "../note-format";
import {
	findName,
	headerProps,
	type Props,
	readProps,
} from "../notes/properties";
import { tagsOf } from "../notes/tags";

export type PropChangeKind = "added" | "removed" | "changed";

export interface PropChange {
	name: string;
	kind: PropChangeKind;
	/** The value as shown (a list joined with ", "); absent when added or removed. */
	before?: string;
	after?: string;
}

export type BlockChangeKind =
	| "added"
	| "removed"
	| "changed"
	| "retyped"
	| "moved";

export interface BlockChange {
	id: string;
	kind: BlockChangeKind;
	/** The block's type now (or before, when removed). */
	type: string;
	/** The type before, when retyped. */
	beforeType?: string;
	/** True when the block also moved (a new parent or a new place among the others). */
	moved: boolean;
	/** The block's plain text before and after (empty for blocks without text). */
	before: string;
	after: string;
}

export interface NoteDiff {
	title: { before: string; after: string } | null;
	props: PropChange[];
	tagsAdded: string[];
	tagsRemoved: string[];
	blocks: BlockChange[];
	/** True when nothing a person would notice changed. */
	same: boolean;
}

/**
 * Properties the app writes on its own (timestamps), hidden unless asked for.
 * Compared ignoring capital letters.
 */
export const APP_WRITTEN_PROPS = ["Reflected"];

const titleOf = (note: Note | null) => {
	const t = note?.header.title;
	return typeof t === "string" ? t : "";
};

/** The plain text inside a block's inline content (text and link labels). */
export function blockText(block: Block): string {
	const parts: string[] = [];
	const walk = (value: JsonValue | undefined) => {
		if (Array.isArray(value)) {
			for (const item of value) walk(item);
			return;
		}
		if (!value || typeof value !== "object") return;
		if (typeof value.text === "string") parts.push(value.text);
		else if (
			value.attrs &&
			typeof value.attrs === "object" &&
			!Array.isArray(value.attrs) &&
			typeof value.attrs.label === "string"
		)
			parts.push(value.attrs.label);
		walk(value.content);
	};
	walk(block.content);
	return parts.join("");
}

function propValues(note: Note | null): Map<string, string> {
	const props: Props = (note && headerProps(note.header)) ?? {};
	const tagsKey = findName(props, "tags");
	const out = new Map<string, string>();
	for (const item of readProps(props)) {
		if (item.name === tagsKey) continue;
		const text = !item.known
			? JSON.stringify(props[item.name])
			: Array.isArray(item.value)
				? item.value.join(", ")
				: item.value === null
					? ""
					: String(item.value);
		out.set(item.name, text);
	}
	return out;
}

function diffProps(
	before: Note | null,
	after: Note | null,
	showAppWritten: boolean,
): PropChange[] {
	const hidden = new Set(
		showAppWritten ? [] : APP_WRITTEN_PROPS.map((p) => p.toLowerCase()),
	);
	const a = propValues(before);
	const b = propValues(after);
	const out: PropChange[] = [];
	const lowerB = new Map([...b.keys()].map((k) => [k.toLowerCase(), k]));
	for (const [name, value] of a) {
		if (hidden.has(name.toLowerCase())) continue;
		const now = lowerB.get(name.toLowerCase());
		if (now === undefined) out.push({ name, kind: "removed", before: value });
		else if ((b.get(now) as string) !== value)
			out.push({
				name: now,
				kind: "changed",
				before: value,
				after: b.get(now),
			});
	}
	const lowerA = new Set([...a.keys()].map((k) => k.toLowerCase()));
	for (const [name, value] of b) {
		if (hidden.has(name.toLowerCase()) || lowerA.has(name.toLowerCase()))
			continue;
		out.push({ name, kind: "added", after: value });
	}
	return out;
}

/** A block without where it sits, to tell an edit from a move. */
function contentKey(block: Block): string {
	const { id: _id, parent: _parent, type: _type, ...rest } = block;
	// Top-level keys sorted (their order in the file carries no meaning).
	const sorted = Object.fromEntries(
		Object.keys(rest)
			.sort()
			.map((k) => [k, rest[k]]),
	);
	return JSON.stringify(sorted);
}

/** The ids in the longest run that keeps its order in both lists. */
function inOrder(a: string[], b: string[]): Set<string> {
	const dp: number[][] = Array.from({ length: a.length + 1 }, () =>
		new Array<number>(b.length + 1).fill(0),
	);
	for (let i = a.length - 1; i >= 0; i--)
		for (let j = b.length - 1; j >= 0; j--)
			(dp[i] as number[])[j] =
				a[i] === b[j]
					? ((dp[i + 1] as number[])[j + 1] as number) + 1
					: Math.max(
							(dp[i + 1] as number[])[j] as number,
							(dp[i] as number[])[j + 1] as number,
						);
	const keep = new Set<string>();
	let i = 0;
	let j = 0;
	while (i < a.length && j < b.length) {
		if (a[i] === b[j]) {
			keep.add(a[i] as string);
			i++;
			j++;
		} else if (
			((dp[i + 1] as number[])[j] as number) >=
			((dp[i] as number[])[j + 1] as number)
		)
			i++;
		else j++;
	}
	return keep;
}

/** Above this many shared blocks, order changes aren't worked out (moves aren't flagged). */
const MAX_ORDERED = 2000;

function diffBlocks(before: Block[], after: Block[]): BlockChange[] {
	const old = new Map(
		before.filter((b) => b.id).map((b) => [b.id as string, b]),
	);
	const now = new Map(
		after.filter((b) => b.id).map((b) => [b.id as string, b]),
	);
	const shared = (list: Block[], other: Map<string, Block>) =>
		list.flatMap((b) => (b.id && other.has(b.id) ? [b.id] : []));
	const a = shared(before, now);
	const b = shared(after, old);
	const ordered = a.length <= MAX_ORDERED ? inOrder(a, b) : new Set(a);
	const out: BlockChange[] = [];
	for (const block of after) {
		if (!block.id) continue;
		const was = old.get(block.id);
		const text = blockText(block);
		if (!was) {
			out.push({
				id: block.id,
				kind: "added",
				type: block.type,
				moved: false,
				before: "",
				after: text,
			});
			continue;
		}
		const moved = was.parent !== block.parent || !ordered.has(block.id);
		const retyped = was.type !== block.type;
		const changed = contentKey(was) !== contentKey(block);
		if (!moved && !retyped && !changed) continue;
		out.push({
			id: block.id,
			kind: retyped ? "retyped" : changed ? "changed" : "moved",
			type: block.type,
			...(retyped ? { beforeType: was.type } : {}),
			moved,
			before: blockText(was),
			after: text,
		});
	}
	for (const block of before) {
		if (!block.id || now.has(block.id)) continue;
		out.push({
			id: block.id,
			kind: "removed",
			type: block.type,
			moved: false,
			before: blockText(block),
			after: "",
		});
	}
	return out;
}

/** Compare two versions of a note. */
export function diffNotes(
	before: Note | null,
	after: Note | null,
	options: { showAppWritten?: boolean } = {},
): NoteDiff {
	const t0 = titleOf(before);
	const t1 = titleOf(after);
	const tagsBefore = tagsOf(before && headerProps(before.header));
	const tagsAfter = tagsOf(after && headerProps(after.header));
	const lower = (list: string[]) => new Set(list.map((t) => t.toLowerCase()));
	const hadTag = lower(tagsBefore);
	const hasTag = lower(tagsAfter);
	const diff: Omit<NoteDiff, "same"> = {
		title: t0 === t1 ? null : { before: t0, after: t1 },
		props: diffProps(before, after, options.showAppWritten ?? false),
		tagsAdded: tagsAfter.filter((t) => !hadTag.has(t.toLowerCase())),
		tagsRemoved: tagsBefore.filter((t) => !hasTag.has(t.toLowerCase())),
		blocks: diffBlocks(before?.blocks ?? [], after?.blocks ?? []),
	};
	return {
		...diff,
		same:
			!diff.title &&
			diff.props.length === 0 &&
			diff.tagsAdded.length === 0 &&
			diff.tagsRemoved.length === 0 &&
			diff.blocks.length === 0,
	};
}

const count = (n: number, one: string, many = `${one}s`) =>
	`${n} ${n === 1 ? one : many}`;

/** One plain line for a list row: "2 blocks added, 1 changed · Status changed". */
export function summarizeDiff(diff: NoteDiff): string {
	if (diff.same) return "No changes";
	const by = (kind: BlockChangeKind) =>
		diff.blocks.filter((b) => b.kind === kind).length;
	const blockParts = [
		by("added") && `${count(by("added"), "block")} added`,
		by("removed") && `${by("removed")} removed`,
		by("changed") + by("retyped") && `${by("changed") + by("retyped")} changed`,
		by("moved") && `${by("moved")} moved`,
	].filter(Boolean);
	const headerParts = [
		diff.title && "renamed",
		...diff.props.map((p) => `${p.name} ${p.kind}`),
		diff.tagsAdded.length > 0 && `${count(diff.tagsAdded.length, "tag")} added`,
		diff.tagsRemoved.length > 0 &&
			`${count(diff.tagsRemoved.length, "tag")} removed`,
	].filter(Boolean);
	return [blockParts.join(", "), headerParts.join(", ")]
		.filter((part) => part !== "")
		.join(" · ");
}
