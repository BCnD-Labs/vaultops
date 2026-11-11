import type { Host } from "../../host/host";
import { type Block, parseNote, prepareSave } from "../note-format";
import { isInsideVaultOps } from "../vault/vault";
import { checkVaultPath, nameKey } from "../vault-path/vault-path";
import {
	extractBlock,
	insertBlock,
	type Placement,
	placeOnCanvas,
} from "./block-move";
import { inOrder } from "./canvas-edit";
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

/**
 * Write the destination before removing the source copy. If the second write
 * fails the first is put back, so the move either happens or leaves both files
 * as they were; only if that also fails does the block exist in both. A canvas
 * that loses connectors or group membership is copied to the recovery folder
 * first. Moves into or out of the same files go one at a time.
 */
export function moveBlock(
	host: Host,
	source: string,
	destination: string,
	blockId: string,
	placement: Placement,
	now: Date = new Date(),
): Promise<MoveReceipt> {
	const [first, second] = [source, destination].sort();
	return inOrder(host, first ?? source, () =>
		inOrder(host, second ?? destination, () =>
			moveNow(host, source, destination, blockId, placement, now),
		),
	);
}

async function moveNow(
	host: Host,
	source: string,
	destination: string,
	blockId: string,
	placement: Placement,
	now: Date,
): Promise<MoveReceipt> {
	if (nameKey(source) === nameKey(destination))
		throw new Error("Choose a different destination note.");
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
	const from = parseNote(sourceText);
	const to = parseNote(destinationText);
	if (!from.note || !to.note || from.problems.length || to.problems.length)
		throw new Error("Both files must be healthy before moving a block.");
	const extracted = extractBlock(from.note, blockId);
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
	if (
		(await host.readText(source)) !== sourceText ||
		(await host.readText(destination)) !== destinationText
	)
		throw new Error("A note changed while the block was being moved.");
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
	await host.writeTextAtomic(destination, destinationSave.text);
	try {
		if ((await host.readText(source)) !== sourceText)
			throw new Error("The source changed after the destination was saved.");
		await host.writeTextAtomic(source, sourceSave.text);
	} catch (error) {
		try {
			await host.writeTextAtomic(destination, destinationText);
		} catch {
			throw new Error(
				`The block was saved to ${destination}, but could not be removed from ${source}, so it is in both. Nothing is lost: delete the extra copy from whichever you do not want.`,
				{ cause: error },
			);
		}
		throw new Error(
			`The block was not moved: ${source} could not be saved. Nothing changed, so you can try again.`,
			{ cause: error },
		);
	}
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
	const [first, second] = [receipt.source, receipt.destination].sort();
	return inOrder(host, first ?? receipt.source, () =>
		inOrder(host, second ?? receipt.destination, async () => {
			if (
				(await host.readText(receipt.source)) !== receipt.sourceAfter ||
				(await host.readText(receipt.destination)) !== receipt.destinationAfter
			)
				throw new Error(
					"One of the two changed since the move, so it can't be undone here. Drag the block back instead.",
				);
			await host.writeTextAtomic(receipt.source, receipt.sourceBefore);
			try {
				await host.writeTextAtomic(
					receipt.destination,
					receipt.destinationBefore,
				);
			} catch (error) {
				await host
					.writeTextAtomic(receipt.source, receipt.sourceAfter)
					.catch(() => undefined);
				throw new Error(
					"The move could not be undone, and nothing was changed.",
					{ cause: error },
				);
			}
		}),
	);
}
