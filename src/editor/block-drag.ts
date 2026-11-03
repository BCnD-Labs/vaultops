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
	return firstLine;
}
