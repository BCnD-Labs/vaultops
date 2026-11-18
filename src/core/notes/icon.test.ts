import { expect, it } from "vitest";
import { type NoteHeader, parseNote, serializeNote } from "../note-format";
import { headerIcon, withIcon } from "./icon";

const header: NoteHeader = {
	format: "vaultops-note",
	v: 1,
	noteId: "note-1",
	future: { value: true },
};

it("sets and removes an optional icon without changing the original or other keys", () => {
	const next = withIcon(header, "star");
	expect(headerIcon(header)).toBeUndefined();
	expect(headerIcon(next)).toBe("star");
	expect(withIcon(next, null)).toEqual(header);
	expect(headerIcon(next)).toBe("star");
});

it("ignores missing, empty and non-string icon values", () => {
	expect(headerIcon(undefined)).toBeUndefined();
	for (const icon of ["", null, ["star"], 42]) {
		expect(headerIcon({ ...header, icon })).toBeUndefined();
	}
});

it("round-trips icon and cover through the existing unknown-header-key support", () => {
	const next = withIcon({ ...header, cover: "attachments/photo.png" }, "star");
	const parsed = parseNote(serializeNote({ header: next, blocks: [] }));
	expect(parsed.problems).toEqual([]);
	expect(parsed.note?.header).toEqual(next);
});
