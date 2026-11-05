// @vitest-environment happy-dom
import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { createNote } from "../core/notes/repository";
import { textStats } from "../core/notes/text-stats";
import { openNote } from "../editor/note-io";
import { MemoryHost } from "../host/memory-host";
import { loadVault } from "./session";
import { useNoteSession } from "./useNoteSession";

const doc = (text: string) => ({
	type: "doc",
	content: [
		{
			type: "paragraph",
			attrs: { id: "p1" },
			content: [{ type: "text", text }],
		},
	],
});

async function setup(writable = true) {
	const host = new MemoryHost();
	await loadVault(host);
	const alpha = await openNote(
		host,
		(await createNote(host, "", "Alpha")).path,
	);
	const beta = await openNote(host, (await createNote(host, "", "Beta")).path);
	const onSaved = vi.fn();
	const onUnsaved = vi.fn();
	const hook = renderHook(() =>
		useNoteSession({ host, writable, onSaved, onUnsaved }),
	);
	return { host, alpha, beta, onSaved, onUnsaved, ...hook };
}

afterEach(() => {
	vi.useRealTimers();
});

it("starts with no note and nothing to recover", async () => {
	const { result } = await setup();
	expect(result.current.opened).toBeNull();
	expect(result.current.livePath).toBeNull();
	expect(result.current.recoveryText(new Date())).toBeNull();
	expect(await result.current.settle()).toBe(true);
});

it("puts a loaded note on screen, and counts each load as a new editor", async () => {
	const { result, alpha, beta } = await setup();
	act(() => result.current.load(alpha, alpha.path));
	expect(result.current.opened).toBe(alpha);
	expect(result.current.livePath).toBe(alpha.path);
	expect(result.current.livePathRef.current).toBe(alpha.path);
	expect(result.current.title).toBe("Alpha");
	expect(result.current.notice).toBeNull();
	expect(result.current.stats).toEqual(textStats(alpha.doc));
	expect(result.current.editorRevision).toBe(1);
	act(() => result.current.load(beta, beta.path));
	expect(result.current.title).toBe("Beta");
	expect(result.current.editorRevision).toBe(2);
});

it("hide keeps the note's path; clear forgets it", async () => {
	const { result, alpha } = await setup();
	act(() => result.current.load(alpha, alpha.path));
	act(() => result.current.hide());
	expect(result.current.opened).toBeNull();
	expect(result.current.livePath).toBe(alpha.path);
	act(() => result.current.load(alpha, alpha.path));
	act(() => result.current.clear());
	expect(result.current.opened).toBeNull();
	expect(result.current.livePath).toBeNull();
	expect(result.current.livePathRef.current).toBeNull();
});

it("saves an edited title, renames the file and follows it to the new path", async () => {
	const { result, host, alpha, onSaved } = await setup();
	act(() => result.current.load(alpha, alpha.path));
	act(() => result.current.editTitle("Gamma"));
	expect(result.current.title).toBe("Gamma");
	await act(async () => {
		expect(await result.current.settle()).toBe(true);
	});
	expect(await host.kindOf("Gamma.vnote")).toBe("file");
	expect(result.current.livePath).toBe("Gamma.vnote");
	expect(onSaved).toHaveBeenCalledWith(
		expect.objectContaining({
			oldPath: alpha.path,
			path: "Gamma.vnote",
			titleChanged: true,
		}),
	);
});

it("a save finishing for the note just left does not move the new note's path", async () => {
	const { result, host, alpha, beta, onSaved } = await setup();
	act(() => result.current.load(alpha, alpha.path));
	act(() => result.current.editTitle("Alpha renamed"));
	// Beta is loaded before Alpha's pending edit has been written.
	await act(async () => {
		result.current.load(beta, beta.path);
	});
	await act(async () => {});
	expect(await host.kindOf("Alpha renamed.vnote")).toBe("file");
	expect(onSaved).toHaveBeenCalledWith(
		expect.objectContaining({
			oldPath: alpha.path,
			path: "Alpha renamed.vnote",
		}),
	);
	expect(result.current.livePath).toBe(beta.path);
	expect(result.current.title).toBe("Beta");
});

it("refuses to leave an unsaved note, says so, and lets retry save it", async () => {
	const { result, host, alpha, onUnsaved } = await setup();
	act(() => result.current.load(alpha, alpha.path));
	const write = host.writeTextAtomic.bind(host);
	host.writeTextAtomic = async () => {
		throw new Error("disk full");
	};
	act(() => result.current.editDoc(doc("not on disk yet")));
	await act(async () => {
		expect(await result.current.settle()).toBe(false);
	});
	expect(onUnsaved).toHaveBeenCalledWith(
		"This note is not saved yet. Retry saving before leaving it.",
	);
	expect(result.current.saveState.kind).toBe("failed");
	expect(result.current.failureReason()).toContain("disk full");
	// The text is still held, so nothing typed is lost.
	expect(result.current.peek()).not.toBeNull();
	host.writeTextAtomic = write;
	await act(async () => {
		expect(await result.current.retry()).toBe(true);
	});
	expect(await host.readText(alpha.path)).toContain("not on disk yet");
});

it("builds recovery text from what is on screen, saved or not", async () => {
	const { result, alpha } = await setup();
	act(() => result.current.load(alpha, alpha.path));
	act(() => result.current.editTitle("Draft title"));
	act(() => result.current.editDoc(doc("words nobody has saved")));
	const text = result.current.recoveryText(new Date("2026-11-05T00:00:00Z"));
	expect(text).toContain("kept at: 2026-11-05T00:00:00.000Z");
	expect(text).toContain(`note: ${alpha.path}`);
	expect(text).toContain("title: Draft title");
	expect(text).toContain("words nobody has saved");
});

it("recounts the status bar once writing pauses, not on every edit", async () => {
	const { result, alpha } = await setup();
	act(() => result.current.load(alpha, alpha.path));
	vi.useFakeTimers();
	const next = doc("one two three four");
	act(() => result.current.editDoc(next));
	expect(result.current.stats).toEqual(textStats(alpha.doc));
	act(() => {
		vi.advanceTimersByTime(300);
	});
	expect(result.current.stats).toEqual(textStats(next));
	expect(result.current.outline).toEqual([]);
});

it("shows a note in a read-only vault locked, and writes nothing", async () => {
	const { result, host, alpha } = await setup(false);
	const before = await host.readText(alpha.path);
	act(() => result.current.load(alpha, alpha.path));
	expect(result.current.opened?.editable).toBe(false);
	expect(result.current.opened?.notice).toBeTruthy();
	act(() => result.current.editTitle("Changed"));
	act(() => result.current.unlock());
	// The vault's lock wins over unlocking one note.
	expect(result.current.opened?.editable).toBe(false);
	await act(async () => {
		expect(await result.current.settle()).toBe(true);
	});
	expect(await host.readText(alpha.path)).toBe(before);
	expect(await host.kindOf("Changed.vnote")).not.toBe("file");
});
