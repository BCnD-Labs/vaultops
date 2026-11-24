/**
 * Putting part of an old version of a note back (pure). Both keep the note's
 * identity (its noteId), so links to it keep working.
 */
import type { Block, Note } from "../note-format";

/** The old version as the note's new content, keeping the current noteId. */
export function restoreVersion(old: Note, current: Note | null): Note {
	const noteId = current?.header.noteId ?? old.header.noteId;
	return {
		header: { ...old.header, noteId },
		blocks: old.blocks.map((b) => structuredClone(b)),
	};
}

/** A block and everything nested under it, in file order. */
function withChildren(blocks: Block[], id: string): Block[] {
	const ids = new Set([id]);
	const out: Block[] = [];
	for (const block of blocks) {
		if (block.id === id || (block.parent !== null && ids.has(block.parent))) {
			if (block.id) ids.add(block.id);
			out.push(structuredClone(block));
		}
	}
	return out;
}

/**
 * Copy one block (with anything nested under it) from an old version into the
 * current note. It goes after the block that came before it in the old version
 * when that is still there, else at the end. Ids already in use get new ones,
 * and a parent that is gone becomes the top level.
 */
export function copyBlockBack(
	current: Note,
	old: Note,
	blockId: string,
	newId: () => string = () => crypto.randomUUID(),
): Note {
	const copied = withChildren(old.blocks, blockId);
	if (copied.length === 0) return current;
	const taken = new Set(current.blocks.map((b) => b.id));
	const rename = new Map<string, string>();
	for (const block of copied)
		if (block.id && taken.has(block.id)) rename.set(block.id, newId());
	const fixed = copied.map((block, index) => {
		const id = block.id ? (rename.get(block.id) ?? block.id) : block.id;
		let parent = block.parent;
		if (parent !== null) parent = rename.get(parent) ?? parent;
		if (index === 0 && parent !== null && !taken.has(parent)) parent = null;
		return { ...block, id, parent } as Block;
	});
	const oldIndex = old.blocks.findIndex((b) => b.id === blockId);
	let anchor = -1;
	for (let i = oldIndex - 1; i >= 0 && anchor < 0; i--) {
		const before = old.blocks[i];
		if (before?.parent === old.blocks[oldIndex]?.parent)
			anchor = current.blocks.findIndex((b) => b.id === before?.id);
	}
	// After the anchor and anything nested under it.
	let at = current.blocks.length;
	if (anchor >= 0) {
		const inside = new Set([current.blocks[anchor]?.id]);
		at = anchor + 1;
		while (at < current.blocks.length) {
			const b = current.blocks[at] as Block;
			if (b.parent === null || !inside.has(b.parent)) break;
			if (b.id) inside.add(b.id);
			at++;
		}
	}
	const blocks = [...current.blocks];
	blocks.splice(at, 0, ...fixed);
	return { ...current, blocks };
}
