import { type Block, isCanvasOnly, type JsonValue } from "../note-format";

type Attrs = { [k: string]: JsonValue };

export function attrsOf(block: Block): Attrs {
	const attrs = block.attrs;
	return attrs && typeof attrs === "object" && !Array.isArray(attrs)
		? (attrs as Attrs)
		: {};
}

export function numberAttr(
	block: Block,
	name: string,
	fallback: number,
): number {
	const value = attrsOf(block)[name];
	return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** The cards, shapes, groups and so on that sit on the canvas: every root except connectors. */
export function canvasNodes(blocks: Block[]): Block[] {
	return blocks.filter(
		(block) =>
			block.parent === null && !!block.id && block.type !== "connector",
	);
}

export function canvasConnectors(blocks: Block[]): Block[] {
	return blocks.filter(
		(block) =>
			block.parent === null && !!block.id && block.type === "connector",
	);
}

export function connectorEnds(block: Block): { from: string; to: string } {
	const attrs = attrsOf(block);
	return {
		from: typeof attrs.from === "string" ? attrs.from : "",
		to: typeof attrs.to === "string" ? attrs.to : "",
	};
}

export function groupMembers(group: Block): string[] {
	const members = attrsOf(group).members;
	return Array.isArray(members)
		? members.filter((id): id is string => typeof id === "string")
		: [];
}

export function newBlockId(): string {
	return crypto.randomUUID();
}

function mapBlock(
	blocks: Block[],
	id: string,
	change: (block: Block) => Block,
): Block[] {
	if (!blocks.some((block) => block.id === id && block.parent === null))
		throw new Error("This item is no longer on the canvas.");
	return blocks.map((block) =>
		block.id === id && block.parent === null ? change(block) : block,
	);
}

function withAttrs(block: Block, attrs: Attrs): Block {
	const { attrs: _old, ...rest } = block;
	return Object.keys(attrs).length > 0 ? { ...rest, attrs } : rest;
}

/** Set attributes on a root block; a value of `undefined` removes the attribute. */
export function patchAttrs(
	blocks: Block[],
	id: string,
	patch: { [k: string]: JsonValue | undefined },
): Block[] {
	return mapBlock(blocks, id, (block) => {
		const next: Attrs = { ...attrsOf(block) };
		for (const [name, value] of Object.entries(patch)) {
			if (value === undefined) delete next[name];
			else next[name] = value;
		}
		return withAttrs(block, next);
	});
}

export function setPositions(
	blocks: Block[],
	positions: { [id: string]: { x: number; y: number } },
): Block[] {
	for (const position of Object.values(positions))
		if (!Number.isFinite(position.x) || !Number.isFinite(position.y))
			throw new Error("Canvas coordinates must be finite numbers.");
	let next = blocks;
	for (const [id, position] of Object.entries(positions))
		next = patchAttrs(next, id, { x: position.x, y: position.y });
	return next;
}

/** Plain text as one text item (an empty string leaves no content). */
export function setText(blocks: Block[], id: string, text: string): Block[] {
	return mapBlock(blocks, id, (block) => {
		const { content: _old, ...rest } = block;
		return text === "" ? rest : { ...rest, content: [{ text, type: "text" }] };
	});
}

export function textOf(block: Block): string {
	const content = block.content;
	if (!Array.isArray(content)) return "";
	return content
		.map((part) =>
			part &&
			typeof part === "object" &&
			!Array.isArray(part) &&
			typeof part.text === "string"
				? part.text
				: "",
		)
		.join("");
}

export function addRoot(blocks: Block[], root: Block): Block[] {
	if (!root.id || root.parent !== null)
		throw new Error("A new canvas item needs an id and no parent.");
	if (blocks.some((block) => block.id === root.id))
		throw new Error("The canvas already has an item with this id.");
	return [...blocks, root];
}

/**
 * Remove roots and everything inside them. Their ids also leave every group's
 * member list and any connector that touched them is removed too. Deleting a
 * group removes only the group: its members stay where they are.
 */
export function deleteRoots(
	blocks: Block[],
	ids: string[],
): { blocks: Block[]; connectorsRemoved: number } {
	const doomed = new Set(ids);
	for (const id of ids)
		if (!blocks.some((block) => block.id === id && block.parent === null))
			throw new Error("This item is no longer on the canvas.");
	for (const block of blocks)
		if (block.parent && doomed.has(block.parent) && block.id)
			doomed.add(block.id);
	let connectorsRemoved = 0;
	const kept: Block[] = [];
	for (const block of blocks) {
		if (block.id && doomed.has(block.id)) continue;
		if (block.type === "connector") {
			const ends = connectorEnds(block);
			if (doomed.has(ends.from) || doomed.has(ends.to)) {
				connectorsRemoved++;
				continue;
			}
		}
		if (block.type === "group") {
			const members = groupMembers(block);
			if (members.some((id) => doomed.has(id))) {
				kept.push(
					withAttrs(block, {
						...attrsOf(block),
						members: members.filter((id) => !doomed.has(id)),
					}),
				);
				continue;
			}
		}
		kept.push(block);
	}
	return { blocks: kept, connectorsRemoved };
}

/**
 * Group the given roots. A group is a frame (`x`, `y`, `w`, `h`), an optional
 * title and a list of member ids. A block is in one group at a time, so it
 * leaves any group it was in. Groups and connectors are never members.
 */
export function createGroup(
	blocks: Block[],
	ids: string[],
	frame: { x: number; y: number; w: number; h: number },
	groupId: string = newBlockId(),
): Block[] {
	const members = ids.filter((id) => {
		const block = blocks.find((b) => b.id === id && b.parent === null);
		return !!block && block.type !== "group" && block.type !== "connector";
	});
	if (members.length < 2)
		throw new Error("Select at least two items to group.");
	if (
		![frame.x, frame.y, frame.w, frame.h].every((n) => Number.isFinite(n)) ||
		frame.w <= 0 ||
		frame.h <= 0
	)
		throw new Error("The group frame is not valid.");
	const moved = new Set(members);
	const cleaned = blocks.map((block) =>
		block.type === "group" && groupMembers(block).some((id) => moved.has(id))
			? withAttrs(block, {
					...attrsOf(block),
					members: groupMembers(block).filter((id) => !moved.has(id)),
				})
			: block,
	);
	return addRoot(cleaned, {
		id: groupId,
		type: "group",
		parent: null,
		attrs: { h: frame.h, members, w: frame.w, x: frame.x, y: frame.y },
	});
}

export function groupOf(blocks: Block[], id: string): Block | undefined {
	return blocks.find(
		(block) => block.type === "group" && groupMembers(block).includes(id),
	);
}

export function addConnector(
	blocks: Block[],
	from: string,
	to: string,
	connectorId: string = newBlockId(),
): Block[] {
	const ok = (id: string) =>
		blocks.some(
			(block) =>
				block.id === id && block.parent === null && block.type !== "connector",
		);
	if (from === to) throw new Error("A connector needs two different items.");
	if (!ok(from) || !ok(to))
		throw new Error("Both ends of a connector must be on the canvas.");
	if (
		canvasConnectors(blocks).some((c) => {
			const ends = connectorEnds(c);
			return ends.from === from && ends.to === to;
		})
	)
		throw new Error("These two items are already connected.");
	return addRoot(blocks, {
		id: connectorId,
		type: "connector",
		parent: null,
		attrs: { arrow: "end", from, to },
	});
}

/** Items that stay on the canvas: canvas-only types, and any type this build does not know. */
export function staysOnCanvas(block: Block, noteTypes: readonly string[]) {
	return isCanvasOnly(block.type) || !noteTypes.includes(block.type);
}
