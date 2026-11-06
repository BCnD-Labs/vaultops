import type { Note } from "../../core/note-format";
import { createNote, loadNote, saveNote } from "../../core/notes/repository";
import {
	addEntry,
	addSection,
	dayOfLogPath,
	logPath,
	newLogNote,
} from "../../core/planner/log";
import {
	JOURNAL_FOLDER,
	type NewTask,
	newTaskNote,
	PLANNER_FOLDER,
	patchTask,
	type TaskPatch,
} from "../../core/planner/task-note";
import type { Host } from "../../host/host";

/** Read a note for editing; a damaged or newer note is never rewritten. */
async function readForEdit(host: Host, path: string): Promise<Note> {
	const parsed = await loadNote(host, path);
	if (
		!parsed.note ||
		parsed.skippedLines.length > 0 ||
		parsed.problems.length > 0
	) {
		throw new Error(
			"This note has problems, so the planner won't change it. See Health.",
		);
	}
	return parsed.note;
}

async function write(host: Host, path: string, note: Note): Promise<void> {
	const result = await saveNote(host, path, note);
	if (!result.ok)
		throw new Error(
			"The change failed the save check, so nothing was written.",
		);
}

export async function createTask(host: Host, task: NewTask): Promise<string> {
	await host.makeFolder(PLANNER_FOLDER);
	const { path } = await createNote(
		host,
		PLANNER_FOLDER,
		task.title,
		newTaskNote(task),
	);
	return path;
}

export async function updateTask(
	host: Host,
	path: string,
	patch: TaskPatch,
): Promise<void> {
	await write(host, path, patchTask(await readForEdit(host, path), patch));
}

/** The note for a day, created on first use at exactly `Journal/<day>.vnote`. */
async function dayNote(
	host: Host,
	day: string,
): Promise<{ path: string; note: Note }> {
	const path = logPath(day);
	if ((await host.kindOf(path)) !== null)
		return { path, note: await readForEdit(host, path) };
	await host.makeFolder(JOURNAL_FOLDER);
	const made = await createNote(host, JOURNAL_FOLDER, day, newLogNote(day));
	if (dayOfLogPath(made.path) !== day)
		throw new Error("A different file already uses that day's name.");
	return made;
}

export async function loadLog(host: Host, day: string): Promise<Note | null> {
	const path = logPath(day);
	if ((await host.kindOf(path)) === null) return null;
	const parsed = await loadNote(host, path);
	return parsed.note;
}

export async function appendLogEntry(
	host: Host,
	day: string,
	sectionId: string | null,
	text: string,
): Promise<string> {
	const { path, note } = await dayNote(host, day);
	await write(host, path, addEntry(note, sectionId, text));
	return path;
}

export async function appendLogSection(
	host: Host,
	day: string,
	name: string,
): Promise<string> {
	const { path, note } = await dayNote(host, day);
	const next = addSection(note, name);
	if (!next) throw new Error("A day can have up to three named sections.");
	await write(host, path, next);
	return path;
}
