import type { Host } from "../../host/host";
import { type Block, parseNote, prepareSave } from "../note-format";
import { isInsideVaultOps } from "../vault/vault";
import { checkVaultPath, nameKey } from "../vault-path/vault-path";
import {
	cloneBlock,
	extractBlock,
	insertBlock,
	type Placement,
	placeOnCanvas,
} from "./block-move";
import { inOrder } from "./canvas-edit";
import { newBlockId } from "./canvas-ops";
import { copyToRecovery } from "./trash";

/**
 * What a move did, enough to take it back: the text of both files before and
 * after. `lost` counts what a canvas gave up because the card left it.
 */
export interface MoveReceipt {
	source: string;
	destination: string;
	sourceBefore: string;
	destinationBefore: string;
	sourceAfter: string;
	destinationAfter: string;
	lost: { connectors: number; groups: number };
	/** Where the source canvas was copied before it lost structure, if it was. */
	recoveryPath: string | null;
}

/** Just right of the cards on a canvas, level with the topmost; the corner when empty. */
const CARD_GAP = 260;
function freeSpot(note: { blocks: Block[] }): { x: number; y: number } {
	const roots = note.blocks.filter(
		(line) => line.parent === null && line.type !== "connector",
	);
	if (roots.length === 0) return { x: 40, y: 40 };
	const at = (line: Block, key: "x" | "y") => {
		const attrs = line.attrs;
		const value =
			attrs && typeof attrs === "object" && !Array.isArray(attrs)
				? attrs[key]
				: undefined;
		return typeof value === "number" && Number.isFinite(value) ? value : 0;
	};
	return {
		x: Math.max(...roots.map((r) => at(r, "x"))) + CARD_GAP,
		y: Math.min(...roots.map((r) => at(r, "y"))),
	};
}

const countOf = (note: { blocks: { type: string }[] }, type: string) =>
	note.blocks.filter((line) => line.type === type).length;

function withMoveLocks<T>(
	host: Host,
	source: string,
	destination: string,
	task: () => Promise<T>,
): Promise<T> {
	if (nameKey(source) === nameKey(destination))
		return Promise.reject(new Error("Choose a different destination note."));
	const first = source < destination ? source : destination;
	const second = first === source ? destination : source;
	return inOrder(host, first, () => inOrder(host, second, task));
}

type FileChange = { path: string; before: string; after: string };

async function restoreFirstWrite(
	host: Host,
	first: FileChange,
	second: FileChange,
): Promise<string | undefined> {
	try {
		// Keep the first copy if the other file changed and might no longer have the block.
		if (
			(await host.readText(second.path)) !== second.before ||
			(await host.readText(first.path)) !== first.after
		)
			return "One of the files changed during the operation. Check both files for the block.";
		await host.writeTextAtomic(first.path, first.before);
	} catch {
		return `${first.path} could not be restored. Check both files for a duplicate block.`;
	}
}

/** Finish a two-file write after the first file has received its copy. */
async function finishMove(
	host: Host,
	first: FileChange,
	second: FileChange,
	messages: { partial: string; restored: string },
): Promise<void> {
	try {
		if (
			(await host.readText(first.path)) !== first.after ||
			(await host.readText(second.path)) !== second.before
		)
			throw new Error("A file changed after the first save.");
		await host.writeTextAtomic(second.path, second.after);
	} catch (cause) {
		const notice = await restoreFirstWrite(host, first, second);
		throw new Error(
			notice ? `${messages.partial} ${notice}` : messages.restored,
			{
				cause,
			},
		);
	}
}

type ExpectedText = { source: string; destination: string };

/**
 * Copy a block (and its descendants) from `source` into `destination` with
 * fresh, unique IDs. Only `destination` is written (atomically); `source` is
 * never written and stays byte-identical. Returns the saved destination text.
 */
export async function copyBlock(
	host: Host,
	source: string,
	destination: string,
	blockId: string,
	placement: Placement,
	generateId: () => string = newBlockId,
	expected?: ExpectedText,
): Promise<string> {
	return withMoveLocks(host, source, destination, () =>
		moveNow(
			host,
			source,
			destination,
			blockId,
			placement,
			new Date(),
			expected,
			generateId,
		),
	);
}

/**
 * Write the destination before removing the source copy. If the second write
 * fails, roll the first back only while both files still match. A canvas that
 * loses connectors or group membership is copied to the recovery folder first.
 * Moves into or out of the same files go one at a time.
 */
export function moveBlock(
	host: Host,
	source: string,
	destination: string,
	blockId: string,
	placement: Placement,
	now: Date = new Date(),
	expected?: ExpectedText,
): Promise<MoveReceipt> {
	return withMoveLocks(host, source, destination, () =>
		moveNow(host, source, destination, blockId, placement, now, expected),
	);
}

/** With `copyId`, a copy: the destination is written and the source is left alone (no receipt). */
async function moveNow(
	host: Host,
	source: string,
	destination: string,
	blockId: string,
	placement: Placement,
	now: Date,
	expected: ExpectedText | undefined,
	copyId: () => string,
): Promise<string>;
async function moveNow(
	host: Host,
	source: string,
	destination: string,
	blockId: string,
	placement: Placement,
	now: Date,
	expected?: ExpectedText,
): Promise<MoveReceipt>;
async function moveNow(
	host: Host,
	source: string,
	destination: string,
	blockId: string,
	placement: Placement,
	now: Date,
	expected?: ExpectedText,
	copyId?: () => string,
): Promise<MoveReceipt | string> {
	for (const path of [source, destination]) {
		if (
			!checkVaultPath(path).ok ||
			isInsideVaultOps(path) ||
			!path.toLowerCase().endsWith(".vnote")
		)
			throw new Error("Block moves require note files inside the vault.");
	}
	const sourceText = await host.readText(source);
	const destinationText = await host.readText(destination);
	if (
		expected &&
		(sourceText !== expected.source || destinationText !== expected.destination)
	)
		throw new Error("A note changed on disk before the block could be moved.");
	const from = parseNote(sourceText);
	const to = parseNote(destinationText);
	if (!from.note || !to.note || from.problems.length || to.problems.length)
		throw new Error("Both files must be healthy before moving a block.");
	const extracted = copyId
		? {
				doc: from.note,
				lines: cloneBlock(
					from.note,
					blockId,
					to.note.blocks.flatMap((line) => (line.id ? [line.id] : [])),
					copyId,
				),
			}
		: extractBlock(from.note, blockId);
	const onCanvas = to.note.header.kind === "canvas";
	// A card sent to a canvas with no spot named goes beside the ones already there.
	const spot = onCanvas && "after" in placement ? freeSpot(to.note) : null;
	const inserted = spot
		? placeOnCanvas(to.note, extracted.lines, spot.x, spot.y)
		: "after" in placement
			? insertBlock(to.note, extracted.lines, placement.after, {
					near: placement.near,
					start: placement.start,
				})
			: placeOnCanvas(to.note, extracted.lines, placement.x, placement.y);
	const destinationSave = prepareSave(inserted);
	const sourceSave = prepareSave(extracted.doc);
	if (!destinationSave.ok || !sourceSave.ok)
		throw new Error("The moved block did not pass the save check.");
	// What the canvas gives up with the card: connectors that ended at it, and
	// its place in a group. Keep the old canvas first so none of it is lost.
	const lost = {
		connectors:
			countOf(from.note, "connector") - countOf(extracted.doc, "connector"),
		groups: groupsChanged(from.note.blocks, extracted.doc.blocks),
	};
	let recoveryPath: string | null = null;
	if (lost.connectors > 0 || lost.groups > 0) {
		const name = source.slice(source.lastIndexOf("/") + 1);
		recoveryPath = (
			await copyToRecovery(host, sourceText, `moved-from/${name}`, now)
		).recoveryPath;
	}
	if (
		(await host.readText(source)) !== sourceText ||
		(await host.readText(destination)) !== destinationText
	)
		throw new Error("A note changed while the block was being moved.");
	await host.writeTextAtomic(destination, destinationSave.text);
	if (copyId) return destinationSave.text;
	await finishMove(
		host,
		{ path: destination, before: destinationText, after: destinationSave.text },
		{ path: source, before: sourceText, after: sourceSave.text },
		{
			partial: `The block move from ${source} could not be completed.`,
			restored: `The block was not moved. ${source} could not be saved. You can try again.`,
		},
	);
	return {
		source,
		destination,
		sourceBefore: sourceText,
		destinationBefore: destinationText,
		sourceAfter: sourceSave.text,
		destinationAfter: destinationSave.text,
		lost,
		recoveryPath,
	};
}

function groupsChanged(
	before: { type: string; id?: string }[],
	after: { type: string; id?: string }[],
): number {
	const memberKey = (line: unknown) => JSON.stringify(line);
	const was = new Map(
		before.filter((l) => l.type === "group").map((l) => [l.id, memberKey(l)]),
	);
	return after.filter(
		(l) => l.type === "group" && was.get(l.id) !== memberKey(l),
	).length;
}

/**
 * Put both files back as they were before a move, if neither has changed since.
 * The source is restored first, so the block is never missing from both.
 */
export function undoMove(host: Host, receipt: MoveReceipt): Promise<void> {
	const { source, destination } = receipt;
	return withMoveLocks(host, source, destination, async () => {
		if (
			(await host.readText(destination)) !== receipt.destinationAfter ||
			(await host.readText(source)) !== receipt.sourceAfter
		)
			throw new Error(
				"One of the two changed since the move, so it can't be undone here. Drag the block back instead.",
			);
		await host.writeTextAtomic(source, receipt.sourceBefore);
		await finishMove(
			host,
			{
				path: source,
				before: receipt.sourceAfter,
				after: receipt.sourceBefore,
			},
			{
				path: destination,
				before: receipt.destinationAfter,
				after: receipt.destinationBefore,
			},
			{
				partial: "The move could not be undone.",
				restored:
					"The move could not be undone. Both files were restored to their state after the move.",
			},
		);
	});
}
