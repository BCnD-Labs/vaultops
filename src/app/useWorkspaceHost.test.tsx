// @vitest-environment happy-dom
import { act, renderHook, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { createCanvas, createNote } from "../core/notes/repository";
import { NEW_TAB } from "../core/workspace";
import { MemoryHost } from "../host/memory-host";
import { loadVault } from "./session";
import { useWorkspaceHost } from "./useWorkspaceHost";

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

async function setup() {
	const host = new MemoryHost();
	await loadVault(host);
	const a = (await createNote(host, "", "Alpha")).path;
	const b = (await createNote(host, "", "Beta")).path;
	const c = (await createNote(host, "", "Gamma")).path;
	const board = (await createCanvas(host, "", "Board")).path;
	const onSaved = vi.fn();
	const onUnsaved = vi.fn();
	const onError = vi.fn();
	const hook = renderHook(() =>
		useWorkspaceHost({
			host,
			writable: true,
			isCanvas: (path) => path === board,
			onSaved,
			onUnsaved,
			onError,
		}),
	);
	const run = (command: () => Promise<boolean>) =>
		act(async () => {
			expect(await command()).toBe(true);
		});
	const ready = (pane: "left" | "right") =>
		waitFor(() => expect(hook.result.current.panes[pane]?.ready).toBe(true));
	return {
		host,
		a,
		b,
		c,
		board,
		onSaved,
		onUnsaved,
		onError,
		run,
		ready,
		...hook,
	};
}

it("opening a note shows it in the left pane and reads it in", async () => {
	const { result, a, run, ready } = await setup();
	expect(result.current.panes.left.kind).toBe("none");
	await run(() => result.current.open(a));
	await ready("left");
	expect(result.current.panes.left).toMatchObject({ kind: "note", active: a });
	expect(result.current.panes.left.session.title).toBe("Alpha");
	expect(result.current.focusedSession).toBe(result.current.panes.left.session);
});

it("switching tabs saves the note left behind and reads the next one", async () => {
	const { result, host, a, b, run, ready } = await setup();
	await run(() => result.current.open(a));
	await ready("left");
	act(() => result.current.panes.left.session.editDoc(doc("typed in alpha")));
	await run(() => result.current.open(b));
	await ready("left");
	expect(result.current.panes.left.session.title).toBe("Beta");
	expect(await host.readText(a)).toContain("typed in alpha");
	await run(() => result.current.select("left", a));
	await ready("left");
	expect(
		JSON.stringify(result.current.panes.left.session.docRef.current),
	).toContain("typed in alpha");
});

it("a canvas takes a pane without a note session; the note is put away", async () => {
	const { result, a, board, run, ready } = await setup();
	await run(() => result.current.open(a));
	await ready("left");
	await run(() => result.current.open(board));
	expect(result.current.panes.left.kind).toBe("canvas");
	await waitFor(() =>
		expect(result.current.panes.left.session.opened).toBeNull(),
	);
	expect(result.current.focusedSession).toBeNull();
});

it("two notes live side by side, each with its own text and autosave", async () => {
	const { result, host, a, b, run, ready } = await setup();
	await run(() => result.current.open(a));
	await run(() => result.current.open(b));
	await run(() => result.current.moveTab(b, "right"));
	await ready("left");
	await ready("right");
	expect(result.current.panes.left.session.title).toBe("Alpha");
	expect(result.current.panes.right?.session.title).toBe("Beta");
	act(() => result.current.panes.right?.session.editDoc(doc("right side")));
	act(() => result.current.panes.left.session.editDoc(doc("left side")));
	await act(async () => {
		expect(await result.current.flushAll()).toBe(true);
	});
	expect(await host.readText(a)).toContain("left side");
	expect(await host.readText(b)).toContain("right side");
	expect(await host.readText(a)).not.toContain("right side");
});

it("refuses a command while a note cannot be saved, and changes nothing", async () => {
	const { result, host, a, b, run, ready, onUnsaved } = await setup();
	await run(() => result.current.open(a));
	await ready("left");
	const write = host.writeTextAtomic.bind(host);
	host.writeTextAtomic = async () => {
		throw new Error("disk full");
	};
	act(() => result.current.panes.left.session.editDoc(doc("not saved yet")));
	await act(async () => {
		expect(await result.current.open(b)).toBe(false);
	});
	expect(onUnsaved).toHaveBeenCalled();
	expect(result.current.panes.left.active).toBe(a);
	expect(result.current.workspace.left.tabs).toEqual([a]);
	expect(result.current.recoveryTexts(new Date())[0]).toContain(
		"not saved yet",
	);
	host.writeTextAtomic = write;
	await run(() => result.current.open(b));
	expect(await host.readText(a)).toContain("not saved yet");
});

it("moving a note's tab to the other pane saves it, then reads it there", async () => {
	const { result, a, b, run, ready } = await setup();
	await run(() => result.current.open(a));
	await run(() => result.current.open(b));
	await ready("left");
	act(() => result.current.panes.left.session.editDoc(doc("moves with me")));
	await run(() => result.current.moveTab(b, "right"));
	await ready("right");
	expect(result.current.panes.right?.active).toBe(b);
	expect(
		JSON.stringify(result.current.panes.right?.session.docRef.current),
	).toContain("moves with me");
	// Alpha stays on the left, read back in.
	await ready("left");
	expect(result.current.panes.left.active).toBe(a);
	expect(result.current.panes.left.session.title).toBe("Alpha");
});

it("a title edit renames the file and the tab follows, with no reload", async () => {
	const { result, host, a, run, ready, onSaved } = await setup();
	await run(() => result.current.open(a));
	await ready("left");
	const before = result.current.panes.left.session.opened;
	act(() => result.current.panes.left.session.editTitle("Renamed"));
	await act(async () => {
		expect(await result.current.flushAll()).toBe(true);
	});
	expect(await host.kindOf("Renamed.vnote")).toBe("file");
	expect(result.current.workspace.left.tabs).toEqual(["Renamed.vnote"]);
	expect(result.current.panes.left.active).toBe("Renamed.vnote");
	expect(result.current.panes.left.ready).toBe(true);
	expect(result.current.panes.left.session.opened).toBe(before);
	expect(onSaved).toHaveBeenCalledWith(
		expect.objectContaining({ oldPath: a, path: "Renamed.vnote" }),
	);
});

it("a note that cannot be read closes its tab and says why", async () => {
	const { result, a, run, ready, onError } = await setup();
	await run(() => result.current.open(a));
	await ready("left");
	await run(() => result.current.open("missing.vnote"));
	await waitFor(() => expect(onError).toHaveBeenCalled());
	await waitFor(() => expect(result.current.workspace.left.tabs).toEqual([a]));
	expect(result.current.panes.left.active).toBe(a);
	await ready("left");
});

it("closing the split saves both notes and keeps both tabs", async () => {
	const { result, host, a, b, run, ready } = await setup();
	await run(() => result.current.open(a));
	await run(() => result.current.open(b));
	await run(() => result.current.moveTab(b, "right"));
	await ready("right");
	act(() => result.current.panes.right?.session.editDoc(doc("from the right")));
	await run(() => result.current.closeSplit());
	expect(result.current.panes.right).toBeNull();
	expect(result.current.workspace.left.tabs).toEqual([a, b]);
	expect(await host.readText(b)).toContain("from the right");
});

it("restores each pane's tabs, showing the first of each", async () => {
	const { result, a, b, c, ready } = await setup();
	act(() => result.current.restoreFrom({ left: [a, c], right: [b] }));
	await ready("left");
	await ready("right");
	expect(result.current.panes.left.active).toBe(a);
	expect(result.current.panes.right?.active).toBe(b);
	expect(result.current.workspace.left.tabs).toEqual([a, c]);
});

it("an empty tab shows no note; recovery text covers only open notes", async () => {
	const { result, a, run, ready } = await setup();
	expect(result.current.recoveryTexts(new Date())).toEqual([]);
	await run(() => result.current.open(a));
	await ready("left");
	await run(() => result.current.newTab());
	expect(result.current.panes.left).toMatchObject({
		kind: "empty",
		active: NEW_TAB,
	});
	await waitFor(() =>
		expect(result.current.panes.left.session.opened).toBeNull(),
	);
	expect(result.current.recoveryTexts(new Date())).toEqual([]);
});
