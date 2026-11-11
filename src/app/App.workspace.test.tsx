// @vitest-environment happy-dom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { JSONContent } from "@tiptap/core";
import { useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { parseNote } from "../core/note-format";
import { createCanvas, createNote } from "../core/notes/repository";
import { MemoryHost } from "../host/memory-host";
import { App } from "./App";
import { loadVault } from "./session";

let sourceId = "";

// Each pane's editor shows its document and can drop a block from the other note.
vi.mock("../editor/NoteEditor", () => ({
	NoteEditor: ({
		doc,
		onDropBlock,
	}: {
		doc: JSONContent;
		onDropBlock: (
			blockId: string,
			sourceId: string,
			slot: { after: string | null; near: string[]; start: boolean },
		) => Promise<void>;
	}) => {
		const [initial] = useState(doc);
		return (
			<div className="note-editor">
				<output data-testid="editor-blocks">{JSON.stringify(initial)}</output>
				<button
					type="button"
					onClick={() =>
						void onDropBlock("block", sourceId, {
							after: null,
							near: [],
							start: false,
						})
					}
				>
					Drop block here
				</button>
			</div>
		);
	},
}));

beforeEach(() => {
	localStorage.setItem("vaultops:sidebar-mode", "navigator");
});
afterEach(() => {
	cleanup();
	localStorage.clear();
});

async function twoNotes() {
	const host = new MemoryHost();
	await loadVault(host);
	const essay = await createNote(host, "", "Essay", {
		header: { format: "vaultops-note", v: 1, noteId: "essay-id" },
		blocks: [
			{
				id: "block",
				type: "paragraph",
				parent: null,
				content: [{ type: "text", text: "Move me" }],
			},
		],
	});
	const target = await createNote(host, "", "Target");
	sourceId = essay.note.header.noteId;
	return { host, essay, target };
}

const pane = (container: HTMLElement, id: "left" | "right") =>
	container.querySelector(`[data-pane-id="${id}"]`) as HTMLElement;

/** Essay on the left, Target on the right. */
async function sideBySide(host: MemoryHost) {
	const view = render(<App host={host} />);
	const user = userEvent.setup();
	await screen.findByRole("textbox", { name: "Title" });
	// The first note to open could be either; make Essay the one on the left.
	const strip = () =>
		within(screen.getByRole("tablist", { name: "Open notes" }));
	if (screen.queryByRole("tab", { name: "Essay" }) === null)
		await user.click(screen.getByTitle("Essay.vnote"));
	await user.click(strip().getByRole("tab", { name: "Essay" }));
	fireEvent.contextMenu(
		strip().getByRole("tab", { name: "Essay" }).parentElement as HTMLElement,
	);
	await user.click(await screen.findByRole("menuitem", { name: "Split view" }));
	// The right pane starts empty; open the other note there from the sidebar.
	const target = strip().queryByRole("tab", { name: "Target" });
	if (target) await user.click(target);
	else await user.click(screen.getByTitle("Target.vnote"));
	await waitFor(() =>
		expect(
			within(pane(view.container, "right")).getByRole("tab", {
				name: "Target",
			}),
		).toBeTruthy(),
	);
	return { ...view, user };
}

it("shows two notes side by side, each with its own tab strip and title", async () => {
	const { host } = await twoNotes();
	const { container } = await sideBySide(host);
	await waitFor(() =>
		expect(screen.getAllByRole("textbox", { name: "Title" })).toHaveLength(2),
	);
	const title = (id: "left" | "right") =>
		(
			within(pane(container, id)).getByRole("textbox", {
				name: "Title",
			}) as HTMLInputElement
		).value;
	expect(title("left")).toBe("Essay");
	expect(title("right")).toBe("Target");
});

it("saves both panes' notes when the window closes", async () => {
	const { host } = await twoNotes();
	const { container } = await sideBySide(host);
	await waitFor(() =>
		expect(screen.getAllByRole("textbox", { name: "Title" })).toHaveLength(2),
	);
	for (const [id, text] of [
		["left", "Essay two"],
		["right", "Target two"],
	] as const)
		fireEvent.change(
			within(pane(container, id)).getByRole("textbox", { name: "Title" }),
			{ target: { value: text } },
		);
	// Closing right away must save both, not only the focused one.
	expect(await host.simulateClose()).toBe(true);
	expect(await host.kindOf("Essay two.vnote")).toBe("file");
	expect(await host.kindOf("Target two.vnote")).toBe("file");
});

it("moves a block from the note on the left into the note on the right", async () => {
	const { host, essay, target } = await twoNotes();
	const { container } = await sideBySide(host);
	await waitFor(() =>
		expect(screen.getAllByTestId("editor-blocks")).toHaveLength(2),
	);
	fireEvent.click(
		within(pane(container, "right")).getByRole("button", {
			name: "Drop block here",
		}),
	);
	await waitFor(async () => {
		expect(
			parseNote(await host.readText(essay.path)).note?.blocks.map((b) => b.id),
		).toEqual([]);
		// It lands at the end of the target note.
		expect(
			parseNote(await host.readText(target.path)).note?.blocks.map((b) => b.id),
		).toContain("block");
	});
	// Both panes show what is on disk now.
	await waitFor(() => {
		expect(
			within(pane(container, "right")).getByTestId("editor-blocks").textContent,
		).toContain("Move me");
		expect(
			within(pane(container, "left")).getByTestId("editor-blocks").textContent,
		).not.toContain("Move me");
	});
});

it("keeps a block in place and says why when the other note is not on screen", async () => {
	const { host, essay } = await twoNotes();
	await createCanvas(host, "", "Board");
	render(<App host={host} />);
	await screen.findByRole("textbox", { name: "Title" });
	sourceId = "some-note-that-is-not-open";
	fireEvent.click(screen.getByRole("button", { name: "Drop block here" }));
	expect((await screen.findByRole("alert")).textContent).toContain(
		"Open the source note",
	);
	expect(
		parseNote(await host.readText(essay.path)).note?.blocks.map((b) => b.id),
	).toEqual(["block"]);
});

it("a canvas can sit on the left with a note on the right", async () => {
	const { host } = await twoNotes();
	await createCanvas(host, "", "Board");
	const user = userEvent.setup();
	const { container } = render(<App host={host} />);
	await screen.findByRole("textbox", { name: "Title" });
	await user.click(screen.getByTitle("Board.vnote"));
	await screen.findByRole("region", { name: "Canvas view" });
	// Send the note to the right side: the canvas stays on the left.
	const strip = () =>
		within(screen.getByRole("tablist", { name: "Open notes" }));
	fireEvent.contextMenu(
		strip().getByRole("tab", { name: "Essay" }).parentElement as HTMLElement,
	);
	await user.click(
		await screen.findByRole("menuitem", { name: "Move to right side" }),
	);
	await waitFor(() =>
		expect(
			within(pane(container, "right")).getByRole("textbox", { name: "Title" }),
		).toBeTruthy(),
	);
	expect(
		within(pane(container, "left")).getByRole("region", {
			name: "Canvas view",
		}),
	).toBeTruthy();
});
