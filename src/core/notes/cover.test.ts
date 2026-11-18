import { expect, it } from "vitest";
import type { NoteHeader } from "../note-format";
import { headerCover, withCover } from "./cover";

it("reads an optional cover and removes only its key", () => {
	const header: NoteHeader = {
		format: "vaultops-note",
		v: 1,
		noteId: "n",
		icon: "star",
	};
	const path = "attachments/photo.png";
	const next = withCover(header, path);
	expect(headerCover(next)).toBe(path);
	expect(headerCover(header)).toBeUndefined();
	expect(withCover(next, null)).toEqual(header);
	for (const invalid of ["", null, 42]) {
		expect(headerCover({ ...header, cover: invalid })).toBeUndefined();
	}
	expect(headerCover({ ...next, kind: "canvas" })).toBeUndefined();
});
