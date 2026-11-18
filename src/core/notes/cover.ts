import type { NoteHeader } from "../note-format";

export function headerCover(header?: NoteHeader): string | undefined {
	const cover = header?.cover;
	return header?.kind !== "canvas" && typeof cover === "string" && cover
		? cover
		: undefined;
}

export function withCover(
	header: NoteHeader,
	cover: string | null,
): NoteHeader {
	const next = { ...header };
	if (cover === null) delete next.cover;
	else next.cover = cover;
	return next;
}
