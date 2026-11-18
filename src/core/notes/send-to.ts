import type { Host } from "../../host/host";
import { linksIn } from "../links/links";
import {
	type Block,
	type JsonValue,
	type Note,
	parseNote,
	prepareSave,
} from "../note-format";
import { validDateKey } from "../planner/dates";
import { dayOfLogPath, logPath, newLogNote } from "../planner/log";
import { JOURNAL_FOLDER } from "../planner/task-note";
import { nameKey } from "../vault-path/vault-path";
import { inOrder } from "./canvas-edit";
import { reconcileProcessed } from "./inbox";
import { type MoveReceipt, moveBlock, undoMove } from "./move-block";
import { headerProps } from "./properties";
import { createNote } from "./repository";
import { tagsOf } from "./tags";

export interface DestinationRow {
	path: string;
	note: Note;
	readOnly?: boolean;
}
export type Suggestion =
	| { kind: "note"; path: string; title: string }
	| { kind: "journal"; day: string; title: string }
	| { kind: "new"; title: string };

/** Most recent first; paths identify destinations independent of their labels. */
export function rememberDestination(
	recent: readonly string[],
	path: string,
): string[] {
	const seen = new Set([nameKey(path)]);
	return [
		path,
		...recent.filter((p) => {
			const key = nameKey(p);
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		}),
	].slice(0, 5);
}

export function suggestDestinations(
	block: Block,
	sourceNote: DestinationRow,
	rows: readonly DestinationRow[],
	recent: readonly string[],
	today: string,
): Suggestion[] {
	const eligible = rows.filter(
		(r) => !r.readOnly && nameKey(r.path) !== nameKey(sourceNote.path),
	);
	const result: Suggestion[] = [];
	const seen = new Set<string>();
	const add = (row: DestinationRow | undefined) => {
		if (!row || seen.has(nameKey(row.path)) || result.length >= 6) return;
		seen.add(nameKey(row.path));
		result.push({
			kind: "note",
			path: row.path,
			title:
				typeof row.note.header.title === "string" &&
				row.note.header.title.trim()
					? row.note.header.title
					: row.path,
		});
	};
	for (const link of linksIn([block]))
		add(eligible.find((r) => r.note.header.noteId === link.target));
	const tags = new Set(
		tagsOf(headerProps(sourceNote.note.header)).map((t) => t.toLowerCase()),
	);
	for (const row of eligible)
		if (
			tagsOf(headerProps(row.note.header)).some((t) =>
				tags.has(t.toLowerCase()),
			)
		)
			add(row);
	for (const path of recent)
		add(eligible.find((r) => nameKey(r.path) === nameKey(path)));
	if (
		nameKey(sourceNote.path) !== nameKey(logPath(today)) &&
		!seen.has(nameKey(logPath(today)))
	)
		result.push({ kind: "journal", day: today, title: "Today's journal" });
	result.push({ kind: "new", title: "New note" });
	return result;
}

/** Move, then reconcile the source under its normal write queue. The receipt includes that write. */
export async function sendToNote(
	host: Host,
	source: string,
	destination: string,
	blockId: string,
	day: string,
	headingId?: string,
): Promise<MoveReceipt> {
	if (!validDateKey(day))
		throw new Error("A valid processing date is required.");
	if (headingId) {
		const parsed = parseNote(await host.readText(destination));
		if (
			!parsed.note ||
			parsed.problems.length ||
			!parsed.note.blocks.some(
				(b) => b.id === headingId && b.type === "heading" && b.parent === null,
			)
		)
			throw new Error("The destination heading was not found.");
	}
	const receipt = await moveBlock(host, source, destination, blockId, {
		after: headingId ?? null,
	});
	if (headingId) {
		const before = parseNote(receipt.destinationBefore);
		if (
			!before.note?.blocks.some(
				(b) => b.id === headingId && b.type === "heading" && b.parent === null,
			)
		) {
			try {
				await undoMove(host, receipt);
			} catch (error) {
				throw new Error(
					"The heading changed during the move and it could not be undone. Reload both notes.",
					{ cause: error },
				);
			}
			throw new Error("The destination heading changed; the move was undone.");
		}
	}
	try {
		return await inOrder(host, source, async () => {
			if ((await host.readText(source)) !== receipt.sourceAfter)
				throw new Error("The source changed after the move.");
			const parsed = parseNote(receipt.sourceAfter);
			if (!parsed.note || parsed.problems.length)
				throw new Error("The source cannot be reconciled safely.");
			const saved = prepareSave(reconcileProcessed(parsed.note, day));
			if (!saved.ok)
				throw new Error("The processed state did not pass the save check.");
			if (saved.text !== receipt.sourceAfter)
				await host.writeTextAtomic(source, saved.text);
			return { ...receipt, sourceAfter: saved.text };
		});
	} catch (error) {
		try {
			await undoMove(host, receipt);
		} catch (rollback) {
			throw new Error(
				"The move succeeded, but the processed state could not be saved or the move undone. Reload both notes before continuing.",
				{ cause: rollback },
			);
		}
		throw new Error(
			"The processed state could not be saved; the move was undone.",
			{ cause: error },
		);
	}
}

export async function sendToJournal(
	host: Host,
	source: string,
	blockId: string,
	day: string,
): Promise<MoveReceipt> {
	if (!validDateKey(day)) throw new Error("A valid journal date is required.");
	const path = logPath(day);
	if (nameKey(path) === nameKey(source))
		throw new Error("Choose a different destination note.");
	if ((await host.kindOf(path)) === null) {
		await host.makeFolder(JOURNAL_FOLDER);
		const made = await createNote(host, JOURNAL_FOLDER, day, newLogNote(day));
		if (dayOfLogPath(made.path) !== day)
			throw new Error(
				`The journal could not be created at ${path}; an empty note was created at ${made.path}.`,
			);
	}
	return sendToNote(host, source, path, blockId, day);
}

export async function sendToNewNote(
	host: Host,
	source: string,
	blockId: string,
	day: string,
	folder = "",
): Promise<MoveReceipt> {
	if (!validDateKey(day))
		throw new Error("A valid processing date is required.");
	const parsed = parseNote(await host.readText(source));
	const block = parsed.note?.blocks.find((b) => b.id === blockId);
	if (!parsed.note || parsed.problems.length || !block)
		throw new Error("The source block cannot be read safely.");
	const plain = (value: JsonValue | undefined): string => {
		if (Array.isArray(value)) return value.map(plain).join("");
		if (!value || typeof value !== "object") return "";
		if (value.type === "hardBreak") return "\n";
		if (value.type === "text" && typeof value.text === "string")
			return value.text;
		if (
			value.type === "noteLink" &&
			value.attrs &&
			typeof value.attrs === "object" &&
			!Array.isArray(value.attrs) &&
			typeof value.attrs.label === "string"
		)
			return value.attrs.label;
		return plain(value.content);
	};
	const title = plain(block.content).split(/\r?\n/)[0]?.trim() || "Untitled";
	const made = await createNote(host, folder, title, { blocks: [] });
	try {
		return await sendToNote(host, source, made.path, blockId, day);
	} catch (error) {
		throw new Error(
			`The send could not be completed. Check the source and the new note at ${made.path}.`,
			{ cause: error },
		);
	}
}

/** Pure edits can be saved and undone by the existing note editor. */
export function turnIntoFlashcard(block: Block): Block {
	const attrs =
		block.attrs &&
		typeof block.attrs === "object" &&
		!Array.isArray(block.attrs)
			? block.attrs
			: {};
	return { ...block, attrs: { ...attrs, role: "flashcard" } };
}
