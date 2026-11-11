import { isCanvasOnly } from "./canvas-types.js";
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
	"canvas-only-in-note",
]);

/** Deeper than any real note; past this a block is refused, not written. */
const MAX_NESTING = 500;

/** How deep a value nests, counted with a stack so a hostile one cannot overflow. */
function nestingOf(root: unknown): number {
	let deepest = 0;
	const stack: [unknown, number][] = [[root, 1]];
	while (stack.length > 0) {
		const [value, depth] = stack.pop() as [unknown, number];
		if (typeof value !== "object" || value === null) continue;
		deepest = Math.max(deepest, depth);
		if (deepest > MAX_NESTING) return deepest;
		for (const child of Object.values(value)) stack.push([child, depth + 1]);
	}
	return deepest;
}

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
	const tooDeep: Problem[] = [];
	note.blocks.forEach((block, index) => {
		if (nestingOf(block) <= MAX_NESTING) return;
		tooDeep.push({
			kind: "bad-block",
			line: index + 2,
			...(block.id ? { blockId: block.id } : {}),
			message: "its content is nested too deeply to save",
		});
	});
	if (tooDeep.length > 0) return { ok: false, problems: tooDeep };
	const problems = findIdProblems(note).filter((p) => BLOCKING.has(p.kind));
	if (note.header.kind !== "canvas") {
		note.blocks.forEach((block, index) => {
			if (!isCanvasOnly(block.type)) return;
			problems.push({
				kind: "canvas-only-in-note",
				line: index + 2,
				...(block.id ? { blockId: block.id } : {}),
				message: `a ${block.type} can only be on a canvas, not in a note`,
			});
		});
	}
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
