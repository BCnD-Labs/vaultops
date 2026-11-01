import { type Host, HostError } from "../../host/host";
import {
	type Block,
	type Note,
	prepareSave,
	serializeBlock,
} from "../note-format";

export interface PendingEntry {
	blockId: string;
	before: string | null;
	after: string | null;
	/** Previous block in the baseline order; null means the first block. */
	anchor: string | null;
}
export type PendingFile = PendingEntry[];
export type ChangeKind = "new" | "deleted" | "changed" | "retyped";

/** Net changes only. Moves and pure reordering are not tracked yet. */
export function updatePending(
	pending: PendingFile,
	previousBlocks: Block[],
	nextBlocks: Block[],
): PendingFile {
	const entries = new Map(
		pending.map((entry) => [entry.blockId, { ...entry }]),
	);
	const previous = new Map(
		previousBlocks.map((block, i) => [
			block.id,
			{
				line: serializeBlock(block),
				anchor: previousBlocks[i - 1]?.id ?? null,
			},
		]),
	);
	const next = new Map(
		nextBlocks.map((block) => [block.id, serializeBlock(block)]),
	);
	for (const id of new Set([...previous.keys(), ...next.keys()])) {
		if (!id) throw new Error("Pending blocks must have IDs.");
		const old = previous.get(id);
		const after = next.get(id) ?? null;
		if ((old?.line ?? null) === after) continue;
		const entry = entries.get(id) ?? {
			blockId: id,
			before: old?.line ?? null,
			after,
			anchor: old?.anchor ?? null,
		};
		entry.after = after;
		if (entry.before === after) entries.delete(id);
		else entries.set(id, entry);
	}
	return [...entries.values()];
}

function pendingPath(noteId: string): string {
	// IDs are data, never path components supplied by the frontend.
	return `.vaultops/pending/${encodeURIComponent(noteId)}.jsonl`;
}

export async function readPending(
	host: Host,
	noteId: string,
): Promise<PendingFile> {
	let text: string;
	try {
		text = await host.readText(pendingPath(noteId));
	} catch (error) {
		if (error instanceof HostError && error.code === "not-found") return [];
		throw error;
	}
	return text
		.trimEnd()
		.split("\n")
		.filter(Boolean)
		.map((line) => {
			const entry = JSON.parse(line) as PendingEntry;
			if (
				!entry ||
				typeof entry.blockId !== "string" ||
				![entry.before, entry.after, entry.anchor].every(
					(v) => v === null || typeof v === "string",
				)
			)
				throw new Error("Invalid pending entry; nothing was overwritten.");
			return entry;
		});
}

export async function writePending(
	host: Host,
	noteId: string,
	pending: PendingFile,
): Promise<void> {
	const path = pendingPath(noteId);
	if (pending.length) {
		await host.makeFolder(".vaultops/pending");
		await host.writeTextAtomic(
			path,
			`${pending.map((entry) => JSON.stringify(entry)).join("\n")}\n`,
		);
	} else if (await host.kindOf(path)) {
		// Host deliberately only deletes from trash. Move there atomically first.
		const folder = `.vaultops/trash/${new Date().toISOString().replace(/[:.]/g, "-")}-${crypto.randomUUID()}`;
		await host.makeFolder(folder);
		await host.move(path, `${folder}/pending.jsonl`);
		try {
			await host.removeTrashed(`${folder}/pending.jsonl`);
		} catch (error) {
			await host.move(`${folder}/pending.jsonl`, path);
			throw error;
		}
	}
}

export async function listChanges(
	host: Host,
	noteId: string,
	currentBlocks: Block[],
): Promise<(PendingEntry & { kind: ChangeKind })[]> {
	const current = new Map(
		currentBlocks.map((block) => [block.id, serializeBlock(block)]),
	);
	const pending = (await readPending(host, noteId))
		.map((entry) => ({ ...entry, after: current.get(entry.blockId) ?? null }))
		.filter((entry) => entry.before !== entry.after);
	return pending.map((entry) => ({
		...entry,
		kind:
			entry.before === null
				? "new"
				: entry.after === null
					? "deleted"
					: JSON.parse(entry.before).type !== JSON.parse(entry.after).type
						? "retyped"
						: "changed",
	}));
}

/** Guard first, pending second, note last. Restore pending if the note write fails. */
export async function saveWithPending(
	host: Host,
	path: string,
	note: Note,
	previousBlocks: Block[],
) {
	const check = prepareSave(note);
	if (!check.ok) return check;
	const before = await readPending(host, note.header.noteId);
	const after = updatePending(before, previousBlocks, note.blocks);
	await writePending(host, note.header.noteId, after);
	try {
		await host.writeTextAtomic(path, check.text);
	} catch (error) {
		await writePending(host, note.header.noteId, before);
		throw error;
	}
	return check;
}
