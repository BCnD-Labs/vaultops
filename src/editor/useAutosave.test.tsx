// @vitest-environment happy-dom
import { act, renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { loadVault } from "../app/session";
import { createNote } from "../core/notes/repository";
import { MemoryHost } from "../host/memory-host";
import { openNote } from "./note-io";
import { isSaveForOpenNote, type SavedInfo, useAutosave } from "./useAutosave";

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

it("matches only a save whose oldPath is the open note's live path", () => {
	expect(isSaveForOpenNote({ oldPath: "Alpha.vnote" }, "Alpha.vnote")).toBe(
		true,
	);
	expect(isSaveForOpenNote({ oldPath: "Alpha.vnote" }, "Beta.vnote")).toBe(
		false,
	);
	expect(isSaveForOpenNote({ oldPath: "Alpha.vnote" }, null)).toBe(false);
});

it("leaves the live path alone when a save finishes for a note that is no longer open", async () => {
	const { host, a, b } = await twoNotes();
	let livePath: string | null = a.path;
	const saved: string[] = [];
	const onSaved = (info: SavedInfo) => {
		saved.push(info.path);
		if (isSaveForOpenNote(info, livePath)) livePath = info.path;
	};
	const { result, rerender } = renderHook(
		({ value }) => useAutosave(host, value, onSaved),
		{ initialProps: { value: a as typeof a | null } },
	);
	await act(async () => {
		result.current.change({ doc: a.doc, title: "Alpha renamed" }, a);
	});
	await act(async () => {
		livePath = b.path;
		rerender({ value: b });
	});
	expect(saved).toEqual(["Alpha renamed.vnote"]);
	expect(livePath).toBe(b.path);
});

it("reports the saved body text and the notes it links to", async () => {
	const { host, a } = await twoNotes();
	const infos: SavedInfo[] = [];
	const { result } = renderHook(() =>
		useAutosave(host, a, (info) => infos.push(info)),
	);
	await act(async () => {});
	await act(async () => {
		result.current.change({
			title: a.note?.header.title as string,
			doc: {
				type: "doc",
				content: [
					{
						type: "paragraph",
						attrs: { id: "p1" },
						content: [
							{ type: "text", text: "Read " },
							{
								type: "noteLink",
								attrs: { kind: "note", target: "other-id", label: "Other" },
							},
						],
					},
				],
			},
		});
	});
	await act(async () => {
		await result.current.flush();
	});
	expect(infos.at(-1)?.text).toBe("Read Other");
	expect(infos.at(-1)?.links).toEqual(["other-id"]);
});

async function conflicted() {
	const host = new MemoryHost();
	await loadVault(host);
	const opened = await openNote(
		host,
		(await createNote(host, "", "Shared")).path,
	);
	const { result } = renderHook(() => useAutosave(host, opened));
	await act(async () => {});
	await act(async () => {
		result.current.change({ doc: opened.doc, title: "Mine" });
	});
	return { host, opened, result };
}

it("flush after a conflict saves again only if the disk still matches, and never overwrites", async () => {
	const { host, opened, result } = await conflicted();
	await host.writeTextAtomic(opened.path, "changed by another app");
	const write = vi.spyOn(host, "writeTextAtomic");
	const read = vi.spyOn(host, "readText");

	await act(async () => {
		expect(await result.current.flush()).toBe(false);
	});
	expect(result.current.state).toMatchObject({
		kind: "failed",
		conflict: true,
	});
	expect(result.current.peek()).not.toBeNull();

	// Window loses focus: that flushes again. The disk is checked again too.
	read.mockClear();
	await act(async () => {
		window.dispatchEvent(new Event("blur"));
	});
	expect(read).toHaveBeenCalledWith(opened.path);
	expect(result.current.state).toMatchObject({
		kind: "failed",
		conflict: true,
	});

	// The other app changes the file again: still a conflict, still no write.
	await host.writeTextAtomic(opened.path, "changed again");
	write.mockClear();
	await act(async () => {
		expect(await result.current.flush()).toBe(false);
	});
	expect(write).not.toHaveBeenCalled();
	expect(await host.readText(opened.path)).toBe("changed again");
	expect(result.current.peek()).not.toBeNull();
});

it("flush after a conflict writes the edit once the file is back to what the app wrote", async () => {
	const { host, opened, result } = await conflicted();
	await host.writeTextAtomic(opened.path, "changed by another app");
	await act(async () => {
		expect(await result.current.flush()).toBe(false);
	});
	await host.writeTextAtomic(opened.path, opened.baseText as string);
	await act(async () => {
		expect(await result.current.flush()).toBe(true);
	});
	expect(result.current.state).toEqual({ kind: "saved" });
	expect(result.current.peek()).toBeNull();
	expect(await host.kindOf("Mine.vnote")).toBe("file");
});

it("discarding after a conflict leaves the other app's file alone and stops further saves", async () => {
	const { host, opened, result } = await conflicted();
	await host.writeTextAtomic(opened.path, "changed by another app");
	await act(async () => {
		await result.current.flush();
	});
	await act(async () => {
		result.current.discard();
	});
	await act(async () => {
		expect(await result.current.flush()).toBe(true);
	});
	expect(await host.readText(opened.path)).toBe("changed by another app");
});
