import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

export const BLOCK_DRAG_TYPE = "application/x-vaultops-block";

export function blockDragData(transfer: DataTransfer): {
	noteId: string;
	blockId: string;
} | null {
	if (!transfer.types.includes(BLOCK_DRAG_TYPE)) return null;
	try {
		const data = JSON.parse(transfer.getData(BLOCK_DRAG_TYPE));
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
	transfer.setData(BLOCK_DRAG_TYPE, JSON.stringify({ noteId, blockId }));
	transfer.setData("text/plain", firstLine);
	setDragEffect(transfer, "effectAllowed", "move");
	return firstLine;
}

export function findBlockDropTarget(
	editorDom: Element,
	doc: ProseMirrorNode,
	clientY: number,
	container?: Element | null,
): { index: number; after: string | null; top: number } {
	const children = Array.from(editorDom.children);
	let index = 0;
	let after: string | null = null;
	for (; index < doc.childCount; index++) {
		const bounds = children[index]?.getBoundingClientRect();
		if (bounds && clientY < bounds.top + bounds.height / 2) break;
		const id = doc.child(index).attrs.id;
		if (typeof id === "string") after = id;
	}
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
	return { index, after, top: edge - origin };
}
