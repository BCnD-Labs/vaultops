import type { NoteHeader } from "../note-format";

export function headerIcon(header: NoteHeader | undefined): string | undefined {
	return typeof header?.icon === "string" && header.icon
		? header.icon
		: undefined;
}

export function withIcon(header: NoteHeader, icon: string | null): NoteHeader {
	const next = { ...header };
	if (icon === null) delete next.icon;
	else next.icon = icon;
	return next;
}
