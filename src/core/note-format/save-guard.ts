import {
	findIdProblems,
	type Note,
	type Problem,
	serializeNote,
} from "./note-format.js";

/** Problems that make a note unsafe to write to disk. */
const BLOCKING: ReadonlySet<Problem["kind"]> = new Set([
	"missing-id",
	"duplicate-id",
	"inline-id",
]);

export type SaveCheck =
	| { ok: true; text: string }
	| { ok: false; problems: Problem[] };

/**
 * Gate every save goes through. Returns the exact text to write, or the
 * blocking problems (each naming its block and line) and no text, so the
 * caller never writes a note that breaks the id rules.
 * Nothing is fixed or changed here.
 */
export function prepareSave(note: Note): SaveCheck {
	const problems = findIdProblems(note).filter((p) => BLOCKING.has(p.kind));
	if (problems.length > 0) return { ok: false, problems };
	return { ok: true, text: serializeNote(note) };
}

/** Human-readable summary of blocking problems for an error message. */
export function describeSaveProblems(problems: Problem[]): string {
	return problems
		.map((p) => {
			const block = p.blockId === undefined ? "a block" : `block ${p.blockId}`;
			return `${block} (line ${p.line}): ${p.message}`;
		})
		.join("\n");
}
