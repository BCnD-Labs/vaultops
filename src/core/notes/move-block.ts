import type { Host } from "../../host/host";
import { parseNote, prepareSave } from "../note-format";
import { isInsideVaultOps } from "../vault/vault";
import { checkVaultPath, nameKey } from "../vault-path/vault-path";
import {
	extractBlock,
	insertBlock,
	type Placement,
	placeOnCanvas,
} from "./block-move";

/** Write the destination before removing the source copy. A failed second write leaves both. */
export async function moveBlock(
	host: Host,
	source: string,
	destination: string,
	blockId: string,
	placement: Placement,
): Promise<void> {
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
	const inserted =
		"after" in placement
			? insertBlock(to.note, extracted.lines, placement.after)
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
	await host.writeTextAtomic(destination, destinationSave.text);
	try {
		if ((await host.readText(source)) !== sourceText)
			throw new Error("The source changed after the destination was saved.");
		await host.writeTextAtomic(source, sourceSave.text);
	} catch (error) {
		throw new Error(
			`The block was saved to ${destination}, but could not be removed from ${source}. It exists in both files.`,
			{ cause: error },
		);
	}
}
