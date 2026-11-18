import { expect, it } from "vitest";
import { indexDocumentIds } from "./document-identity";

it("indexes only unique healthy IDs regardless of the order of copies", () => {
	const rows = [
		{ id: "duplicate", path: "a", readOnly: false },
		{ id: "duplicate", path: "b", readOnly: true },
		{ id: "duplicate", path: "c", readOnly: false },
		{ id: "damaged", path: "d", readOnly: true },
		{ id: "healthy", path: "e", readOnly: false },
		{ id: "", path: "f", readOnly: false },
		{ path: "g", readOnly: false },
	];
	for (const ordered of [rows, rows.slice(1)])
		expect([...indexDocumentIds(ordered)]).toEqual([["healthy", "e"]]);
});
