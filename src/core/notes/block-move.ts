import { type Block, isCanvasOnly, type Note } from "../note-format";
import { attrsOf, connectorEnds, groupMembers } from "./canvas-ops";

/**
 * Where a block lands. In a note, `after: null` means the end. A drop from the
 * editor also says `start` (above the first block) and `near`: the blocks above
 * the drop, nearest first, used when `after` is not in the saved file.
 */
export type Placement =
	| { after: string | null; near?: string[]; start?: boolean }
	| { x: number; y: number };

function requireIds(lines: Block[]): Set<string> {
	const ids = new Set<string>();
	for (const line of lines) {
		if (!line.id || ids.has(line.id))
			throw new Error("Moved blocks need unique IDs.");
		ids.add(line.id);
	}
	return ids;
}

/** Keep descendants in their original line order, including nested containers. */
export function extractBlock(
	doc: Note,
	blockId: string,
): { lines: Block[]; doc: Note } {
	const root = doc.blocks.find((line) => line.id === blockId);
	if (!root) throw new Error(`Block ${blockId} was not found.`);
	if (isCanvasOnly(root.type))
		throw new Error(
			"Shapes, sticky notes, labels, groups and connectors stay on the canvas.",
		);
	const selected = new Set([blockId]);
	for (const line of doc.blocks) {
		if (line.parent && selected.has(line.parent) && line.id)
			selected.add(line.id);
	}
	// On a canvas, what pointed at the moved item lets go: its connectors are
	// removed and it leaves any group's member list.
	const remaining: Block[] = [];
	for (const line of doc.blocks) {
		if (line.id && selected.has(line.id)) continue;
		if (line.type === "connector") {
			const ends = connectorEnds(line);
			if (selected.has(ends.from) || selected.has(ends.to)) continue;
		}
		if (
			line.type === "group" &&
			groupMembers(line).some((id) => selected.has(id))
		) {
			const { attrs: _old, ...rest } = line;
			remaining.push({
				...rest,
				attrs: {
					...attrsOf(line),
					members: groupMembers(line).filter((id) => !selected.has(id)),
				},
			});
			continue;
		}
		remaining.push(line);
	}
	return {
		lines: doc.blocks.filter((line) => line.id && selected.has(line.id)),
		doc: { ...doc, blocks: remaining },
	};
}

function checkedDestination(doc: Note, lines: Block[]): Block {
	if (!lines.length) throw new Error("There is no block to move.");
	if (lines.some((line) => isCanvasOnly(line.type)))
		throw new Error(
			"Shapes, sticky notes, labels, groups and connectors stay on the canvas.",
		);
	const ids = requireIds(lines);
	if (doc.blocks.some((line) => line.id && ids.has(line.id)))
		throw new Error("The destination already contains a block with this ID.");
	if (
		lines.slice(1).some((line) => line.parent !== null && !ids.has(line.parent))
	)
		throw new Error("A moved block has a parent outside the selection.");
	return lines[0] as Block;
}

/** Insert after the anchor's descendants; null appends at the end. */
export function insertBlock(
	doc: Note,
	lines: Block[],
	at: string | null,
	drop?: { near?: string[]; start?: boolean },
): Note {
	if (doc.header.kind === "canvas")
		throw new Error("Use canvas placement for a canvas.");
	const root = checkedDestination(doc, lines);
	let index = doc.blocks.length;
	let anchorId = at;
	let anchor = -1;
	if (drop?.start) {
		index = 0;
		anchorId = null;
	} else if (at !== null) {
		// A drop can name a block the saved file does not have yet; use the
		// nearest block above it that is saved, or the top if none is.
		const roots = new Set(
			doc.blocks.filter((line) => !line.parent && line.id).map((l) => l.id),
		);
		const found = [at, ...(drop?.near ?? [])].find((id) => roots.has(id));
		if (found === undefined) {
			if (!drop) throw new Error(`Block ${at} was not found.`);
			index = 0;
			anchorId = null;
		} else anchorId = found;
	}
	if (anchorId !== null) {
		const target = anchorId;
		anchor = doc.blocks.findIndex((line) => line.id === target);
		const descendants = new Set([target]);
		index = anchor + 1;
		while (index < doc.blocks.length) {
			const line = doc.blocks[index] as Block;
			if (!line.parent || !descendants.has(line.parent)) break;
			if (line.id) descendants.add(line.id);
			index++;
		}
	}
	const attrs =
		root.attrs && typeof root.attrs === "object" && !Array.isArray(root.attrs)
			? { ...root.attrs }
			: undefined;
	if (attrs) {
		delete attrs.x;
		delete attrs.y;
	}
	const { attrs: _canvasAttrs, ...rootWithoutAttrs } = root;
	const moved = [
		{
			...rootWithoutAttrs,
			parent: null,
			...(attrs && Object.keys(attrs).length ? { attrs } : {}),
		},
		...lines.slice(1),
	];
	return {
		...doc,
		blocks: [
			...doc.blocks.slice(0, index),
			...moved,
			...doc.blocks.slice(index),
		],
	};
}

export function placeOnCanvas(
	doc: Note,
	lines: Block[],
	x: number,
	y: number,
): Note {
	if (doc.header.kind !== "canvas")
		throw new Error("The destination is not a canvas.");
	if (!Number.isFinite(x) || !Number.isFinite(y))
		throw new Error("Canvas coordinates must be finite numbers.");
	const root = checkedDestination(doc, lines);
	const attrs =
		root.attrs && typeof root.attrs === "object" && !Array.isArray(root.attrs)
			? root.attrs
			: {};
	return {
		...doc,
		blocks: [
			...doc.blocks,
			{ ...root, parent: null, attrs: { ...attrs, x, y } },
			...lines.slice(1),
		],
	};
}
