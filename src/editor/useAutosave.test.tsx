// @vitest-environment happy-dom
import { act, renderHook } from "@testing-library/react";
import { expect, it } from "vitest";
import { loadVault } from "../app/session";
import { createNote } from "../core/notes/repository";
import { MemoryHost } from "../host/memory-host";
import { openNote } from "./note-io";
import { useAutosave } from "./useAutosave";

it("keeps an edit made before the autosave for a new note exists", async () => {
	const host = new MemoryHost();
	await loadVault(host);
	const note = await createNote(host, "", "Original");
	const opened = await openNote(host, note.path);
	const { result, rerender } = renderHook(
		({ value }) => useAutosave(host, value),
		{ initialProps: { value: null as typeof opened | null } },
	);
	// Same act scope: the new note is committed, but its effects have not run yet.
	await act(async () => {
		rerender({ value: opened });
		result.current.change({ doc: opened.doc, title: "Renamed" });
	});
	await act(async () => {
		expect(await result.current.flush()).toBe(true);
	});
	expect(await host.kindOf("Renamed.vnote")).toBe("file");
});
