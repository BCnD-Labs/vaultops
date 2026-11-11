import type { Host } from "../../host/host";
import { type Block, parseNote, prepareSave } from "../note-format";

const queues = new WeakMap<Host, Map<string, Promise<unknown>>>();

/**
 * Runs writes to one file one at a time. Each write checks the file against the
 * text it was based on, so a write that comes second finds the first one's
 * result and is refused, instead of both passing the check and the later one
 * silently replacing the earlier.
 */
export function inOrder<T>(host: Host, path: string, task: () => Promise<T>) {
	let byPath = queues.get(host);
	if (!byPath) {
		byPath = new Map();
		queues.set(host, byPath);
	}
	const run = (byPath.get(path) ?? Promise.resolve()).then(task, task);
	const tail = run.then(
		() => undefined,
		() => undefined,
	);
	byPath.set(path, tail);
	void tail.then(() => {
		if (byPath.get(path) === tail) byPath.delete(path);
	});
	return run;
}

/**
 * The one way a canvas is changed on disk. `mutate` gets the canvas's blocks
 * (parsed from `baseText`, the text the screen showed) and returns the new
 * blocks. The result must pass the save check, and the file must still equal
 * `baseText`, or nothing is written. Returns the text that was saved.
 */
export function saveCanvasEdit(
	host: Host,
	path: string,
	baseText: string,
	mutate: (blocks: Block[]) => Block[],
	action = "editing it",
): Promise<string> {
	return inOrder(host, path, () =>
		saveCanvasEditNow(host, path, baseText, mutate, action),
	);
}

async function saveCanvasEditNow(
	host: Host,
	path: string,
	baseText: string,
	mutate: (blocks: Block[]) => Block[],
	action: string,
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
export function restoreCanvasText(
	host: Host,
	path: string,
	currentText: string,
	nextText: string,
): Promise<void> {
	return inOrder(host, path, () =>
		restoreCanvasTextNow(host, path, currentText, nextText),
	);
}

async function restoreCanvasTextNow(
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
