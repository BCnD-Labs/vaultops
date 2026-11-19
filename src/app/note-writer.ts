import type { Change } from "../core/notes/properties";
import { type SavedInfo, savedInfoOf } from "../editor/useAutosave";
import type { LiveDocuments, PropsEdit, PropsWrite } from "./live-documents";

/**
 * The one way a view changes a note's properties (a table cell today; board
 * and calendar drags later). The live-documents registry decides how: through
 * the editor that holds the note, so it changes on screen at once, or as an
 * atomic write that never builds on an older base. Edits to one note made
 * while its write is still waiting join that write, so typing in a cell of a
 * closed note doesn't queue one write per key.
 */
export function createNoteWriter({
	documents,
	onSaved,
}: {
	documents: () => LiveDocuments | null;
	/** Told about each note written to disk, so the note list (and views) update. */
	onSaved: (info: SavedInfo) => void;
}) {
	type Job = { edits: PropsEdit[]; result?: Promise<PropsWrite> };
	const waiting = new Map<string, Job>();

	function setProps(noteId: string, edit: PropsEdit): Promise<PropsWrite> {
		const registry = documents();
		if (!registry)
			return Promise.resolve({ ok: false, message: "No vault is open." });
		const queued = waiting.get(noteId);
		if (queued?.result) {
			queued.edits.push(edit);
			return queued.result;
		}
		const job: Job = { edits: [edit] };
		waiting.set(noteId, job);
		const leave = () => {
			if (waiting.get(noteId) === job) waiting.delete(noteId);
		};
		const result = registry
			.writeProps(noteId, (props) => {
				leave();
				return job.edits.reduce<Change>(
					(change, next) => (change.ok ? next(change.props) : change),
					{ ok: true, props },
				);
			})
			.then((result) => {
				if (result.ok && result.saved)
					onSaved(
						savedInfoOf(
							result.saved.path,
							result.saved.path,
							result.saved.note,
						),
					);
				return result;
			})
			.catch((error: unknown) => ({
				ok: false as const,
				message: error instanceof Error ? error.message : String(error),
			}))
			.finally(leave);
		job.result = result;
		return result;
	}

	return { setProps };
}

export type NoteWriter = ReturnType<typeof createNoteWriter>;
