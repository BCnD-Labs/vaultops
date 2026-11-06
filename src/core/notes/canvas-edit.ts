import type { Host } from "../../host/host";
import { type Block, parseNote, prepareSave } from "../note-format";

/**
 * The one way a canvas is changed on disk. `mutate` gets the canvas's blocks
 * (parsed from `baseText`, the text the screen showed) and returns the new
 * blocks. The result must pass the save check, and the file must still equal
 * `baseText`, or nothing is written. Returns the text that was saved.
 */
export async function saveCanvasEdit(
	host: Host,
	path: string,
	baseText: string,
	mutate: (blocks: Block[]) => Block[],
	action = "editing it",
): Promise<string> {
	const parsed = parseNote(baseText);
	if (parsed.note?.header.kind !== "canvas" || parsed.problems.length)
		throw new Error("This canvas cannot be edited safely.");
	const saved = prepareSave({
		...parsed.note,
		blocks: mutate(parsed.note.blocks),
	});
	if (!saved.ok) throw new Error("The canvas did not pass the save check.");
	if ((await host.readText(path)) !== baseText)
		throw new Error(`The canvas changed on disk. Reload it before ${action}.`);
	await host.writeTextAtomic(path, saved.text);
	return saved.text;
}

/**
 * Puts back a canvas text from the undo history. The file must still equal
 * `currentText` (what the screen showed) and `nextText` must still be a clean
 * canvas, or nothing is written.
 */
export async function restoreCanvasText(
	host: Host,
	path: string,
	currentText: string,
	nextText: string,
): Promise<void> {
	const parsed = parseNote(nextText);
	if (parsed.note?.header.kind !== "canvas" || parsed.problems.length)
		throw new Error("That earlier version cannot be restored safely.");
	if ((await host.readText(path)) !== currentText)
		throw new Error(
			"The canvas changed on disk, so undo and redo were cleared. Reload it first.",
		);
	await host.writeTextAtomic(path, nextText);
}
