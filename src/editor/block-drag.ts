import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

export const BLOCK_DRAG_TYPE = "application/x-vaultops-block";

/** The note a VaultOps block drag started in, local drags included. */
export function blockDragNote(transfer: DataTransfer): string | null {
	if (!transfer.types.includes(BLOCK_DRAG_TYPE)) return null;
	try {
		const data = JSON.parse(transfer.getData(BLOCK_DRAG_TYPE));
		return typeof data?.noteId === "string" ? data.noteId : null;
	} catch {
		return null;
	}
}

/**
 * The block a drag carries to another note or a canvas. A list item drag is
 * local: it only moves within its own list's note, so it gives nothing here.
 */
export function blockDragData(transfer: DataTransfer): {
	noteId: string;
	blockId: string;
} | null {
	if (!transfer.types.includes(BLOCK_DRAG_TYPE)) return null;
	try {
		const data = JSON.parse(transfer.getData(BLOCK_DRAG_TYPE));
		if (data?.local === true) return null;
		return typeof data?.noteId === "string" &&
			data.noteId &&
			typeof data?.blockId === "string" &&
			data.blockId
			? { noteId: data.noteId, blockId: data.blockId }
			: null;
	} catch {
		return null;
	}
}

/** Only identifiers cross the drag boundary. The receiver reads saved blocks. */
export function setDragEffect(
	transfer: DataTransfer,
	field: "effectAllowed" | "dropEffect",
	value: "move" | "none",
) {
	try {
		transfer[field] = value;
	} catch {
		/* Synthetic test events may define read-only DataTransfer properties. */
	}
}

export function setBlockDragImage(
	transfer: DataTransfer,
	element: HTMLElement,
) {
	try {
		transfer.setDragImage?.(element, 0, 0);
	} catch {
		/* Happy DOM's DataTransfer.setDragImage throws Not implemented. */
	}
}

export function setBlockDragData(
	transfer: DataTransfer,
	noteId: string,
	block: ProseMirrorNode,
): string | null {
	const blockId = block.attrs.id;
	if (typeof blockId !== "string" || blockId === "") return null;
	let first = block;
	while (!first.isTextblock && first.firstChild) first = first.firstChild;
	const firstLine =
		first.textContent.split(/\r?\n/, 1)[0]?.trim() || block.type.name;
	// A list item can't stand alone in another note or on a canvas.
	const local = block.type.name === "listItem";
	transfer.setData(
		BLOCK_DRAG_TYPE,
		JSON.stringify({ noteId, blockId, ...(local ? { local } : {}) }),
	);
	transfer.setData("text/plain", firstLine);
	setDragEffect(transfer, "effectAllowed", "move");
	return firstLine;
}

export function findBlockDropTarget(
	editorDom: Element,
	doc: ProseMirrorNode,
	clientY: number,
	container?: Element | null,
): {
	index: number;
	after: string | null;
	/** Blocks above the slot, nearest first, for when `after` is not saved yet. */
	near: string[];
	/** The slot is above the first block. */
	start: boolean;
	top: number;
} {
	// The open gap is not a block, and it must not count as one.
	const children = Array.from(editorDom.children).filter(
		(child) => !child.classList.contains("block-drop-slot"),
	);
	let index = 0;
	const above: string[] = [];
	// Anywhere in a block's top half is the slot above it, the bottom half the
	// slot below it, so the whole height of the page is a target.
	for (; index < doc.childCount; index++) {
		const bounds = children[index]?.getBoundingClientRect();
		if (bounds && clientY < bounds.top + bounds.height / 2) break;
		const id = doc.child(index).attrs.id;
		if (typeof id === "string") above.unshift(id);
	}
	const after = above[0] ?? null;
	const origin = (container ?? editorDom).getBoundingClientRect().top;
	const beforeRect =
		index > 0 ? children[index - 1]?.getBoundingClientRect() : undefined;
	const afterRect =
		index < children.length
			? children[index]?.getBoundingClientRect()
			: undefined;
	const edge =
		beforeRect && afterRect
			? (beforeRect.bottom + afterRect.top) / 2
			: afterRect
				? afterRect.top
				: beforeRect
					? beforeRect.bottom
					: origin;
	return {
		index,
		after,
		near: above.slice(1),
		start: index === 0,
		top: edge - origin,
	};
}
