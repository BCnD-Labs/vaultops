import type { Block } from "../note-format";
import { attrsOf } from "./canvas-ops";

/** The id of the note an embed shows, or "" for an embed that points at nothing. */
export function embedNoteId(block: Block): string {
	const value = attrsOf(block).note;
	return typeof value === "string" ? value : "";
}

/** The part of a note row that embedding needs. */
export interface EmbedRow {
	id?: string;
	kind?: "note" | "canvas";
}

export type EmbedTarget<T extends EmbedRow> =
	| { status: "found"; row: T }
	/** Nothing in the vault has this id (the note was deleted or is not loaded). */
	| { status: "missing" }
	/** Several files claim this id, so none can be trusted to be the one. */
	| { status: "ambiguous"; count: number }
	/** The id belongs to a canvas; a canvas never shows inside a canvas. */
	| { status: "canvas" }
	| { status: "unlinked" };

/**
 * Which note an embed shows. The embed holds the target's `noteId`, so it still
 * finds the note after a rename or a move.
 */
export function resolveEmbed<T extends EmbedRow>(
	rows: readonly T[],
	noteId: string,
): EmbedTarget<T> {
	if (noteId === "") return { status: "unlinked" };
	const matches = rows.filter((row) => row.id === noteId);
	const [first] = matches;
	if (!first) return { status: "missing" };
	if (matches.length > 1) return { status: "ambiguous", count: matches.length };
	if (first.kind === "canvas") return { status: "canvas" };
	return { status: "found", row: first };
}

/**
 * The notes that can be embedded: not canvases, with an id of their own that no
 * other file shares.
 */
export function embeddable<T extends EmbedRow>(rows: readonly T[]): T[] {
	const count = new Map<string, number>();
	for (const row of rows)
		if (row.id) count.set(row.id, (count.get(row.id) ?? 0) + 1);
	return rows.filter(
		(row) => row.kind !== "canvas" && !!row.id && count.get(row.id) === 1,
	);
}

export const EMBED_SIZE = { h: 240, w: 320 } as const;

/** A new embed root block for the canvas. */
export function embedBlock(
	id: string,
	noteId: string,
	at: { x: number; y: number },
): Block {
	if (noteId === "") throw new Error("An embed needs the id of a note.");
	return {
		id,
		type: "embed",
		parent: null,
		attrs: {
			h: EMBED_SIZE.h,
			note: noteId,
			w: EMBED_SIZE.w,
			x: Math.round(at.x - EMBED_SIZE.w / 2),
			y: Math.round(at.y - EMBED_SIZE.h / 2),
		},
	};
}
