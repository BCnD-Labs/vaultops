import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

export const BLOCK_DRAG_TYPE = "application/x-vaultops-block";

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
