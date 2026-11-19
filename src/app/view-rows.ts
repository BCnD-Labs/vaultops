import type { MatchRow } from "../core/views/match";
import { sameViewFields } from "../core/views/row";
import type { NoteRow } from "./session";

/** A note as live views see it. `version` changes only when a view-relevant part does. */
export interface ViewRow extends MatchRow {
	readOnly: boolean;
	version: number;
}

function toViewRow(note: NoteRow, version: number): ViewRow {
	return {
		path: note.path,
		...(note.id ? { id: note.id } : {}),
		title: note.title,
		...(note.kind ? { kind: note.kind } : {}),
		readOnly: note.readOnly,
		tags: note.tags,
		links: note.links ?? [],
		fields: note.fields ?? {},
		...(note.type ? { type: note.type } : {}),
		...(note.cover ? { cover: note.cover } : {}),
		version,
	};
}

const sameList = (a: readonly string[] = [], b: readonly string[] = []) =>
	a.length === b.length && a.every((x, i) => x === b[i]);

function sameForViews(a: ViewRow, b: ViewRow): boolean {
	return (
		a.path === b.path &&
		a.id === b.id &&
		a.title === b.title &&
		a.kind === b.kind &&
		a.readOnly === b.readOnly &&
		sameList(a.tags, b.tags) &&
		sameList(a.links, b.links) &&
		sameViewFields(a, b)
	);
}

/**
 * The note rows live views read. Every autosave replaces a note's row (its text
 * and preview change as you type); this store keeps the same `ViewRow` object,
 * and the same snapshot, unless something a view can show or match on changed.
 */
export function createViewRows() {
	const byPath = new Map<string, { source: NoteRow; row: ViewRow }>();
	let snapshot: readonly ViewRow[] = [];
	let version = 0;
	const listeners = new Set<() => void>();

	return {
		/** Take the vault's current rows; listeners hear only real changes. */
		sync(notes: readonly NoteRow[]): void {
			let changed = notes.length !== byPath.size;
			const seen = new Set<string>();
			const next: ViewRow[] = [];
			for (const note of notes) {
				seen.add(note.path);
				const old = byPath.get(note.path);
				let row = old?.row;
				if (!old || old.source !== note) {
					const fresh = toViewRow(note, version + 1);
					if (!row || !sameForViews(row, fresh)) {
						row = fresh;
						changed = true;
					}
					byPath.set(note.path, { source: note, row });
				}
				if (row) next.push(row);
			}
			for (const path of byPath.keys()) {
				if (!seen.has(path)) {
					byPath.delete(path);
					changed = true;
				}
			}
			if (!changed) return;
			version++;
			snapshot = next;
			for (const listener of listeners) listener();
		},
		/** The rows in vault order; the same array until something changes. */
		getSnapshot: (): readonly ViewRow[] => snapshot,
		subscribe(listener: () => void): () => void {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
	};
}

export type ViewRows = ReturnType<typeof createViewRows>;
