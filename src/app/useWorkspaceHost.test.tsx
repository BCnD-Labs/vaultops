// @vitest-environment happy-dom
import { act, renderHook, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { parseNote, serializeNote } from "../core/note-format";
import { moveFolder } from "../core/notes/folders";
import { createCanvas, createNote } from "../core/notes/repository";
import { NEW_TAB } from "../core/workspace";
import { createQuitGuard } from "../editor/quit";
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

it("renames a detached dirty note through its save queue", async () => {
	const { result, host, a, b, ready, run } = await setup();
	await run(() => result.current.open(a));
	await ready("left");
	const write = vi
		.spyOn(host, "writeTextAtomic")
		.mockRejectedValue(new Error("disk full"));
	act(() => result.current.panes.left.session.editDoc(doc("Detached draft")));
	await act(async () => expect(await result.current.flushAll()).toBe(false));
	act(() => result.current.restoreFrom({ left: [b, a], right: [] }));
	await ready("left");
	write.mockRestore();
	await run(
		async () => (await result.current.renameDraft(a, "Renamed")) === true,
	);
	expect(result.current.workspace.left.tabs).toEqual([b, "Renamed.vnote"]);
	expect(await host.readText("Renamed.vnote")).toContain("Detached draft");
});

it("moves both entries in a folder and saves their drafts at the new paths", async () => {
	const { result, host, ready, run } = await setup();
	await host.makeFolder("Class");
	await host.makeFolder("Archive");
	const one = (await createNote(host, "Class", "One")).path;
	const two = (await createNote(host, "Class", "Two")).path;
	await run(() => result.current.open(one));
	await run(() => result.current.open(two));
	await run(() => result.current.moveTab(two, "right"));
	await Promise.all([ready("left"), ready("right")]);
	act(() => {
		result.current.panes.left.session.editDoc(doc("Left draft"));
		result.current.panes.right?.session.editDoc(doc("Right draft"));
	});
	await act(async () =>
		result.current.withDocuments(async (registry) => {
			const moved = await moveFolder(
				registry.guardMoves(host, result.current.rekey),
				"Class",
				"Archive",
			);
			expect(moved.changed).toBe(true);
		}),
	);
	expect(result.current.workspace.left.active).toBe("Archive/Class/One.vnote");
	expect(result.current.workspace.right?.active).toBe(
		"Archive/Class/Two.vnote",
	);
	await run(result.current.flushAll);
	expect(await host.readText("Archive/Class/One.vnote")).toContain(
		"Left draft",
	);
	expect(await host.readText("Archive/Class/Two.vnote")).toContain(
		"Right draft",
	);
});

async function setup(writable = true) {
	const host = new MemoryHost();
	await loadVault(host);
	const a = (await createNote(host, "", "Alpha")).path;
	const b = (await createNote(host, "", "Beta")).path;
	const c = (await createNote(host, "", "Gamma")).path;
	const board = (await createCanvas(host, "", "Board")).path;
	const onSaved = vi.fn();
	const onUnsaved = vi.fn();
	const onError = vi.fn();
	const { notes } = await loadVault(host);
	const hook = renderHook(
		({ writable }) =>
			useWorkspaceHost({
				host,
				writable,
				isCanvas: (path) => path === board,
				notes,
				onSaved,
				onUnsaved,
				onError,
			}),
		{ initialProps: { writable } },
	);
	const run = (command: () => Promise<boolean>) =>
		act(async () => {
			expect(await command()).toBe(true);
		});
	const ready = (pane: "left" | "right") =>
		waitFor(() => expect(hook.result.current.panes[pane]?.ready).toBe(true));
	return {
		host,
		id: (path: string) => notes.find((note) => note.path === path)?.id ?? "",
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

it("saves the latest edits after a note changes panes during a write", async () => {
	const { a, b, host, result, run, ready } = await setup();
	await run(() => result.current.open(a));
	await ready("left");
	let release!: () => void;
	const paused = new Promise<void>((resolve) => {
		release = resolve;
	});
	const write = host.writeTextAtomic.bind(host);
	host.writeTextAtomic = vi.fn(async (path, text) => {
		if (path === a) await paused;
		await write(path, text);
	});
	const left = result.current.panes.left.session;
	act(() => {
		left.editTitle("First title");
		left.editCover("attachments/cover.png");
	});
	const firstSave = result.current.flushAll();
	try {
		await waitFor(() =>
			expect(host.writeTextAtomic).toHaveBeenCalledWith(a, expect.any(String)),
		);
		act(() => result.current.restoreFrom({ left: [b], right: [a] }));
		await ready("right");
		const right = result.current.panes.right?.session;
		expect(right?.saveState.kind).toBe("saving");
		expect(right?.title).toBe("First title");
		act(() => {
			right?.editTitle("Latest title");
			right?.editDoc(doc("latest body"));
			right?.editProps({ owner: "latest" });
			right?.editIcon("star");
		});
	} finally {
		release();
		await act(async () => expect(await firstSave).toBe(true));
	}
	const file = await host.readText("Latest title.vnote");
	expect(file).toContain("latest body");
	expect(parseNote(file).note?.header).toMatchObject({
		title: "Latest title",
		props: { owner: "latest" },
		icon: "star",
		cover: "attachments/cover.png",
	});
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

it("an empty tab shows no note and adds nothing to recovery", async () => {
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

it("blocks quit on a detached failed write and recovers it once", async () => {
	const { result, host, a, b, ready, run, rerender } = await setup();
	await run(() => result.current.open(a));
	await ready("left");
	const write = vi
		.spyOn(host, "writeTextAtomic")
		.mockRejectedValue(new Error("disk full"));
	const session = result.current.panes.left.session;
	act(() => {
		session.editTitle("Unsaved title");
		session.editProps({ owner: "Draft owner" });
		session.editDoc(doc("Detached body"));
	});
	await act(async () => expect(await session.flush()).toBe(false));
	act(() => result.current.restoreFrom({ left: [b], right: [] }));
	await ready("left");
	let recovery = "";
	const close = createQuitGuard(result.current.flushAll, async () => {
		recovery = result.current.recoveryText(new Date());
		return true;
	});
	await act(async () => {
		expect(await close()).toBe(false);
		const pick = vi.fn(async () => "Another vault");
		expect(await result.current.chooseVault(pick)).toBe(false);
		expect(pick).not.toHaveBeenCalled();
		expect(await close()).toBe(true);
	});
	expect(recovery.match(/note: Alpha\.vnote/g)).toHaveLength(1);
	expect(recovery).toContain("title: Unsaved title");
	expect(recovery).toContain('properties: {"owner":"Draft owner"}');
	expect(recovery).toContain("Detached body");
	expect(recovery).not.toContain("Beta.vnote");

	write.mockRestore();
	rerender({ writable: false });
	expect(result.current.panes.left.session.opened?.editable).toBe(false);
	await act(async () => expect(await result.current.flushAll()).toBe(false));
	expect(result.current.recoveryText(new Date())).toContain("Detached body");
	rerender({ writable: true });
	act(() => window.dispatchEvent(new Event("blur")));
	await waitFor(() =>
		expect(result.current.recoveryTexts(new Date())).toEqual([]),
	);
	expect(await host.readText("Unsaved title.vnote")).toContain("Detached body");
});

// Block moves between any two shown documents.

/** Give a note the blocks it will be asked to give up (ids are what moves). */
async function seed(host: MemoryHost, path: string, ids: string[]) {
	const note = parseNote(await host.readText(path)).note;
	if (!note) throw new Error("seed: unreadable note");
	await host.writeTextAtomic(
		path,
		serializeNote({
			...note,
			blocks: ids.map((id) => ({
				id,
				type: "paragraph",
				parent: null,
				content: [{ type: "text", text: id }],
			})),
		}),
	);
}

const blockIds = async (host: MemoryHost, path: string) =>
	(parseNote(await host.readText(path)).note?.blocks ?? []).map((b) => b.id);

/** Alpha on the left, Beta on the right, both read in. */
async function side(s: Awaited<ReturnType<typeof setup>>) {
	await seed(s.host, s.a, ["x", "y"]);
	await seed(s.host, s.b, ["z"]);
	await s.run(() => s.result.current.open(s.a));
	await s.run(() => s.result.current.open(s.b));
	await s.run(() => s.result.current.moveTab(s.b, "right"));
	await s.ready("left");
	await s.ready("right");
}

it("moves a block from one note into the note beside it, and shows both", async () => {
	const s = await setup();
	await side(s);
	const outcome = await act(async () =>
		s.result.current.dropBlock(s.id(s.b), "x", s.id(s.a), {
			after: "z",
		}),
	);
	expect(outcome).toMatchObject({ ok: true });
	expect(await blockIds(s.host, s.a)).toEqual(["y"]);
	expect(await blockIds(s.host, s.b)).toEqual(["z", "x"]);
	const shown = (pane: "left" | "right") =>
		s.result.current.panes[pane]?.session.opened?.note?.blocks.map((b) => b.id);
	expect(shown("left")).toEqual(["y"]);
	expect(shown("right")).toEqual(["z", "x"]);
});

it("saves unsaved text in both notes before the move", async () => {
	const s = await setup();
	await side(s);
	const keep = {
		type: "doc",
		content: ["x", "y"].map((id) => ({
			type: "paragraph",
			attrs: { id },
			content: [{ type: "text", text: `${id} edited` }],
		})),
	};
	act(() => s.result.current.panes.left.session.editDoc(keep));
	const outcome = await act(async () =>
		s.result.current.dropBlock(s.id(s.b), "x", s.id(s.a), {
			after: null,
		}),
	);
	expect(outcome).toMatchObject({ ok: true });
	const text = await s.host.readText(s.a);
	expect(text).toContain("y edited");
	expect(text).not.toContain("x edited");
	expect(await s.host.readText(s.b)).toContain("x edited");
});

it("moves an unsaved block through the canvas and a detached embedded note", async () => {
	const s = await setup();
	await seed(s.host, s.a, ["x"]);
	await seed(s.host, s.b, ["z"]);
	await s.run(() => s.result.current.open(s.a));
	await s.run(() => s.result.current.open(s.board));
	await s.run(() => s.result.current.moveTab(s.board, "right"));
	await s.ready("left");
	const a = s.id(s.a),
		b = s.id(s.b),
		board = s.id(s.board);
	const embed = s.result.current.documents?.subscribePassive(b, vi.fn());
	const shown = s.result.current.documents?.subscribePassive(board, vi.fn());
	await Promise.all([embed?.ready, shown?.ready]);
	const draft = {
		type: "doc",
		content: [{ ...doc("Unsaved x").content[0], attrs: { id: "x" } }],
	};
	act(() => {
		const session = s.result.current.panes.left.session;
		session.editDoc(draft);
		session.editTitle("Renamed Alpha");
	});
	const drop = (
		target: string,
		source: string,
		placement: Parameters<typeof s.result.current.dropBlock>[3],
	) =>
		act(async () =>
			expect(
				await s.result.current.dropBlock(target, "x", source, placement),
			).toMatchObject({ ok: true }),
		);
	await drop(board, a, { x: 40, y: 50 });
	expect(shown?.current()?.draft?.blocks[0]).toMatchObject({
		id: "x",
		attrs: { x: 40, y: 50 },
	});
	const reposition = vi.spyOn(s.host, "writeTextAtomic");
	await drop(board, board, { x: 80, y: 90 });
	expect(reposition).toHaveBeenCalledTimes(1);
	reposition.mockRestore();
	await drop(b, board, { after: null, start: true });
	expect(shown?.current()?.draft?.blocks).toEqual([]);
	expect(embed?.current()?.draft?.blocks.map((block) => block.id)).toEqual([
		"x",
		"z",
	]);
	await drop(a, b, { after: null });
	expect(await s.host.readText("Renamed Alpha.vnote")).toContain("Unsaved x");
	expect(embed?.current()?.draft?.blocks.map((block) => block.id)).toEqual([
		"z",
	]);
});

it("works with the canvas on the left and the note on the right", async () => {
	const s = await setup();
	await seed(s.host, s.b, ["z"]);
	await s.run(() => s.result.current.open(s.board));
	await s.run(() => s.result.current.open(s.b));
	await s.run(() => s.result.current.moveTab(s.b, "right"));
	await s.ready("right");
	const outcome = await act(async () =>
		s.result.current.dropBlock(s.id(s.board), "z", s.id(s.b), {
			x: 1,
			y: 2,
		}),
	);
	expect(outcome).toMatchObject({ ok: true });
	expect(await blockIds(s.host, s.b)).toEqual([]);
	expect(parseNote(await s.host.readText(s.board)).note?.blocks[0]?.id).toBe(
		"z",
	);
});

it("refuses when the source document is not one of the shown documents", async () => {
	const s = await setup();
	await side(s);
	const outcome = await act(async () =>
		s.result.current.dropBlock(s.id(s.b), "x", "some-other-note", {
			after: null,
		}),
	);
	expect(outcome).toEqual({
		ok: false,
		message:
			"Open the source note before moving this block. It may be missing or read-only.",
	});
	expect(await blockIds(s.host, s.a)).toEqual(["x", "y"]);
});

it("refuses to move a block when an unsaved note cannot be saved", async () => {
	const s = await setup();
	await side(s);
	act(() =>
		s.result.current.panes.left.session.editDoc({
			type: "doc",
			content: [
				{
					type: "paragraph",
					attrs: { id: "x" },
					content: [{ type: "text", text: "edited" }],
				},
			],
		}),
	);
	const write = vi
		.spyOn(s.host, "writeTextAtomic")
		.mockRejectedValue(new Error("disk full"));
	const outcome = await act(async () =>
		s.result.current.dropBlock(s.id(s.b), "x", s.id(s.a), {
			after: null,
		}),
	);
	write.mockRestore();
	expect(outcome.ok).toBe(false);
	expect(outcome.ok === false && outcome.message).toContain(
		"Save the note before moving a block",
	);
	expect(await blockIds(s.host, s.b)).toEqual(["z"]);
});

it.each([false, true])(
	"reconciles both views after a failed move (rollback fails: %s)",
	async (partial) => {
		const s = await setup();
		await side(s);
		const real = s.host.writeTextAtomic.bind(s.host);
		const write = vi
			.spyOn(s.host, "writeTextAtomic")
			.mockImplementationOnce(real)
			.mockRejectedValueOnce(new Error("disk full"));
		if (partial) write.mockRejectedValueOnce(new Error("rollback failed"));
		const outcome = await act(() =>
			s.result.current.dropBlock(s.id(s.b), "x", s.id(s.a), { after: null }),
		);
		write.mockRestore();
		expect(outcome.ok).toBe(false);
		expect(outcome.ok === false && outcome.message).toContain(
			partial ? "duplicate block" : "was not moved",
		);
		const target = partial ? ["z", "x"] : ["z"];
		expect(await blockIds(s.host, s.a)).toEqual(["x", "y"]);
		expect(await blockIds(s.host, s.b)).toEqual(target);
		expect(
			s.result.current.panes.right?.session.opened?.note?.blocks.map(
				(b) => b.id,
			),
		).toEqual(target);
	},
);

it("refuses every block move in a read-only vault", async () => {
	const s = await setup(false);
	const outcome = await act(() =>
		s.result.current.dropBlock("right", "x", "any", { after: null }),
	);
	expect(outcome).toEqual({
		ok: false,
		message: "This vault is read-only, so the block was not moved.",
	});
});

it("the canvas menu has nowhere to send a block when no note is beside it", async () => {
	const s = await setup();
	await s.run(() => s.result.current.open(s.board));
	const outcome = await act(() => s.result.current.blockToNote("left", "x"));
	expect(outcome).toEqual({
		ok: false,
		message: "Open a note beside the canvas to move this block into.",
	});
});

it("copies on Option-drag and resolves a source tab after a mid-drag tab switch", async () => {
	const s = await setup();
	await seed(s.host, s.a, ["x", "y"]);
	await seed(s.host, s.b, ["z"]);
	await s.run(() => s.result.current.open(s.a));
	await s.run(() => s.result.current.open(s.b));
	const alphaBefore = await s.host.readText(s.a);
	const alphaId = s.id(s.a);
	// Beta is active in the same pane after a spring-loaded tab switch; Option-drag copies x into Beta.
	const copied = await act(async () =>
		s.result.current.dropBlock(s.id(s.b), "x", alphaId, { after: "z" }, true),
	);
	expect(copied).toMatchObject({ ok: true, moved: { copy: true } });
	expect(await s.host.readText(s.a)).toBe(alphaBefore);
	const betaIds = await blockIds(s.host, s.b);
	expect(betaIds).toHaveLength(2);
	expect(betaIds[1]).not.toBe("x");
	// Normal drag without Option still moves x out of Alpha into Beta.
	const moved = await act(async () =>
		s.result.current.dropBlock(s.id(s.b), "x", alphaId, {
			after: "z",
		}),
	);
	expect(moved).toMatchObject({ ok: true });
	expect(await blockIds(s.host, s.a)).toEqual(["y"]);
	expect(await blockIds(s.host, s.b)).toContain("x");
	await act(async () =>
		expect(await s.result.current.undo()).toMatchObject({ ok: true }),
	);
	expect(await blockIds(s.host, s.b)).toEqual(betaIds);
	await seed(s.host, s.a, ["new-source"]);
	const movedPath = "Renamed Beta.vnote";
	await s.host.move(s.b, movedPath);
	act(() => s.result.current.rekey(s.b, movedPath));
	await act(async () =>
		expect(await s.result.current.undo()).toMatchObject({ ok: true }),
	);
	expect(await blockIds(s.host, movedPath)).toEqual(["z"]);
	expect(await blockIds(s.host, s.a)).toEqual(["new-source"]);
});
