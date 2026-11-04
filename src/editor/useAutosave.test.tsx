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

async function twoNotes() {
	const host = new MemoryHost();
	await loadVault(host);
	const a = await openNote(host, (await createNote(host, "", "Alpha")).path);
	const b = await openNote(host, (await createNote(host, "", "Beta")).path);
	return { host, a, b };
}

it("does not write an edit made to the next note into the previous note", async () => {
	const { host, a, b } = await twoNotes();
	const alphaBefore = await host.readText(a.path);
	const { result, rerender } = renderHook(
		({ value }) => useAutosave(host, value),
		{ initialProps: { value: a as typeof a | null } },
	);
	await act(async () => {});
	// Same act scope: Beta is committed, but Alpha's autosave is still live.
	await act(async () => {
		rerender({ value: b });
		result.current.change({ doc: b.doc, title: "Beta edited" });
	});
	await act(async () => {
		await result.current.flush();
	});
	expect(await host.readText(a.path)).toBe(alphaBefore);
	expect(await host.kindOf("Alpha.vnote")).toBe("file");
});

it("keeps an edit made to the next note, saved to that note", async () => {
	const host = new MemoryHost();
	await loadVault(host);
	const a = await openNote(host, (await createNote(host, "", "Alpha")).path);
	const b = await openNote(host, (await createNote(host, "", "Beta")).path);
	const { result, rerender } = renderHook(
		({ value }) => useAutosave(host, value),
		{ initialProps: { value: a as typeof a | null } },
	);
	await act(async () => {});
	await act(async () => {
		rerender({ value: b });
		result.current.change({ doc: b.doc, title: "Beta edited" });
	});
	await act(async () => {
		expect(await result.current.flush()).toBe(true);
	});
	expect(await host.kindOf("Beta edited.vnote")).toBe("file");
});

it("flushes an unsaved edit on the previous note when switching notes", async () => {
	const { host, a, b } = await twoNotes();
	const { result, rerender } = renderHook(
		({ value }) => useAutosave(host, value),
		{ initialProps: { value: a as typeof a | null } },
	);
	await act(async () => {
		result.current.change({ doc: a.doc, title: "Alpha saved on switch" });
	});
	await act(async () => {
		rerender({ value: b });
	});
	expect(await host.kindOf("Alpha saved on switch.vnote")).toBe("file");
});
