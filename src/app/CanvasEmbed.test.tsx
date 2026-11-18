// @vitest-environment happy-dom
import {
	act,
	cleanup,
	createEvent,
	fireEvent,
	render,
	renderHook,
	screen,
	within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Canvas } from "@/components/ui/canvas";
import { TooltipProvider } from "@/components/ui/tooltip";
import { type Note, serializeNote } from "../core/note-format";
import type { EmbedTarget } from "../core/notes/canvas-embed";
import { previewOf } from "../core/notes/scan";
import { BLOCK_DRAG_TYPE } from "../editor/block-drag";
import { blocksToDoc } from "../editor/doc-blocks";
import { NoteEditor } from "../editor/NoteEditor";
import { openNote } from "../editor/note-io";
import { MemoryHost } from "../host/memory-host";
import { CanvasEmbed } from "./CanvasEmbed";
import { FloatingNotes } from "./FloatingNotes";
import { createLiveDocuments } from "./live-documents";
import type { NoteRow } from "./session";
import { useNoteSession } from "./useNoteSession";

beforeEach(() => vi.stubGlobal("IntersectionObserver", undefined));
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

const meeting: Note = {
	header: {
		format: "vaultops-note",
		v: 1,
		noteId: "n-meet",
		title: "Meeting",
	},
	blocks: [
		{
			id: "p1",
			type: "heading",
			parent: null,
			attrs: { level: 1 },
			content: [{ type: "text", text: "Agenda ".repeat(24).trim() }],
		},
		{
			id: "p2",
			type: "paragraph",
			parent: null,
			content: [{ type: "text", text: "Ship the canvas" }],
		},
	],
};

const row: NoteRow = {
	path: "Meeting.vnote",
	id: "n-meet",
	title: "Meeting",
	preview: previewOf(meeting.blocks),
	readOnly: false,
	kind: "note",
	tags: [],
};
const target = { status: "found", row } as const;

const editedBlocks = (text: string) =>
	meeting.blocks.map((block) =>
		block.id === "p2" ? { ...block, content: [{ type: "text", text }] } : block,
	);

async function hostWithMeeting() {
	const host = new MemoryHost();
	await host.writeTextAtomic("Meeting.vnote", serializeNote(meeting));
	return host;
}

function registry(host: MemoryHost, writable = true) {
	return createLiveDocuments(
		host,
		{ notes: [target.row], writable },
		{
			open: (path, text) => openNote(host, path, text),
			onSaved: vi.fn(),
		},
	);
}

it("shows the embedded note read-only, with its title", async () => {
	const host = await hostWithMeeting();
	const write = vi.spyOn(host, "writeTextAtomic");
	render(<CanvasEmbed documents={registry(host)} target={target} />);
	expect(await screen.findByText("Ship the canvas")).toBeTruthy();
	expect(screen.getByText(/Agenda/)).toBeTruthy();
	expect(screen.getByText("Meeting")).toBeTruthy();
	// It is a picture of the note: nothing to type into, and nothing written.
	expect(screen.queryByRole("textbox")).toBeNull();
	expect(write).not.toHaveBeenCalled();
});

it.each([false, true])(
	"routes a drop between embedded blocks ahead of the canvas (editing: %s)",
	async (editing) => {
		const host = await hostWithMeeting();
		const route = vi.fn().mockResolvedValue(undefined);
		const canvasDrop = vi.fn();
		const label = (
			<CanvasEmbed
				documents={registry(host)}
				host={host}
				target={target}
				onDropBlock={route}
			/>
		);
		render(
			<TooltipProvider>
				<Canvas
					nodes={[
						{
							id: "embed",
							type: "item",
							position: { x: 0, y: 0 },
							data: { label },
						},
					]}
					editable
					onMove={vi.fn()}
					onDropBlock={canvasDrop}
				/>
			</TooltipProvider>,
		);
		await screen.findByText("Ship the canvas");
		const embed = screen.getByLabelText("Embedded note");
		if (editing) {
			fireEvent.doubleClick(embed);
			await within(embed).findByLabelText("Note editor drop area");
		}
		const root = embed.querySelector(
			editing ? ".ProseMirror > p" : ".canvas-embed-body > p",
		);
		if (!root) throw new Error("Missing rendered paragraph.");
		vi.spyOn(root, "getBoundingClientRect").mockReturnValue(
			new DOMRect(0, 100, 100, 40),
		);
		const dataTransfer = new DataTransfer();
		dataTransfer.setData(
			BLOCK_DRAG_TYPE,
			JSON.stringify({ noteId: "board", blockId: "card" }),
		);
		for (const type of ["dragOver", "drop"] as const) {
			const event = createEvent[type](root);
			Object.defineProperties(event, {
				clientY: { value: 105 },
				altKey: { value: true },
				dataTransfer: { value: dataTransfer },
			});
			fireEvent(root, event);
			if (type === "dragOver") {
				expect(within(embed).getByTestId("block-drop-indicator")).toBeTruthy();
				expect(screen.queryByTestId("canvas-drop-placeholder")).toBeNull();
			}
		}
		expect(route).toHaveBeenCalledWith(
			row.id,
			"card",
			"board",
			{ after: "p1", near: [], start: false },
			true,
		);
		expect(canvasDrop).not.toHaveBeenCalled();
		expect(within(embed).queryByTestId("block-drop-indicator")).toBeNull();
	},
);

it.each(["note", "vault"])(
	"cannot activate an embed with a read-only %s",
	async (locked) => {
		const host = await hostWithMeeting();
		const documents = createLiveDocuments(
			host,
			{ notes: [row], writable: locked !== "vault" },
			{ open: (path, text) => openNote(host, path, text), onSaved: vi.fn() },
		);
		render(
			<CanvasEmbed
				host={host}
				documents={documents}
				target={{ ...target, row: { ...row, readOnly: locked === "note" } }}
			/>,
		);
		await act(async () => {
			fireEvent.doubleClick(screen.getByLabelText("Embedded note"));
		});
		expect(document.querySelector("[contenteditable]")).toBeNull();
	},
);

it("opens the note from its button, with the note's current path", async () => {
	const user = userEvent.setup();
	const host = await hostWithMeeting();
	const onOpen = vi.fn();
	render(
		<CanvasEmbed documents={registry(host)} target={target} onOpen={onOpen} />,
	);
	await user.click(screen.getByRole("button", { name: "Open Meeting" }));
	expect(onOpen).toHaveBeenCalledWith("Meeting.vnote");
});

it("shows a disk edit after the registry refreshes", async () => {
	const host = await hostWithMeeting();
	const documents = registry(host);
	render(<CanvasEmbed documents={documents} target={target} />);
	await screen.findByText("Ship the canvas");
	await host.writeTextAtomic(
		"Meeting.vnote",
		serializeNote({
			...meeting,
			blocks: [
				{
					id: "p2",
					type: "paragraph",
					parent: null,
					content: [{ type: "text", text: "Ship it Friday" }],
				},
			],
		}),
	);
	await documents.refresh([row], vi.fn());
	expect(await screen.findByText("Ship it Friday")).toBeTruthy();
	expect(screen.queryByText("Ship the canvas")).toBeNull();
});

it("says plainly why nothing is shown, and offers no Open button", () => {
	const reasons: [EmbedTarget<NoteRow>, RegExp][] = [
		[{ status: "missing" }, /not in the vault/],
		[{ status: "ambiguous", count: 2 }, /More than one file/],
		[{ status: "canvas" }, /canvas cannot be shown inside a canvas/],
		[{ status: "unlinked" }, /does not point at a note/],
	];
	for (const [target, text] of reasons) {
		const view = render(
			<CanvasEmbed documents={null} target={target} onOpen={vi.fn()} />,
		);
		expect(screen.getByText(text)).toBeTruthy();
		expect(screen.queryByRole("button")).toBeNull();
		view.unmount();
	}
});

it("says so when the note cannot be read, and when the file is a canvas", async () => {
	const host = new MemoryHost();
	await host.writeTextAtomic("Meeting.vnote", "this is not a note");
	const view = render(
		<CanvasEmbed documents={registry(host)} target={target} />,
	);
	expect(await screen.findByText(/could not be read/)).toBeTruthy();
	view.unmount();
	await host.writeTextAtomic(
		"Meeting.vnote",
		serializeNote({
			header: { ...meeting.header, kind: "canvas" },
			blocks: [],
		}),
	);
	render(<CanvasEmbed documents={registry(host)} target={target} />);
	expect(await screen.findByText(/could not be read/)).toBeTruthy();
});

it("marks itself as staying on the canvas when the canvas is locked", () => {
	render(
		<CanvasEmbed documents={null} target={{ status: "missing" }} locked />,
	);
	const article = screen.getByLabelText("Embedded note");
	expect(article.className).toContain("canvas-item-pinned");
	expect(article.getAttribute("title")).toMatch(/stay on the canvas/);
});

function mockVisibility() {
	type Notify = (entries: { isIntersecting: boolean }[]) => void;
	const callbacks = new Map<Element, Notify>();
	vi.stubGlobal(
		"IntersectionObserver",
		class {
			constructor(private callback: Notify) {}
			observe(element: Element) {
				callbacks.set(element, this.callback);
			}
			disconnect() {}
		},
	);
	return (element: Element, isIntersecting: boolean) => {
		callbacks.get(element)?.([{ isIntersecting }]);
	};
}

it("shares one read across fifty visible copies and shows unsaved pane edits past the preview", async () => {
	const show = mockVisibility();
	const host = await hostWithMeeting();
	const read = vi.spyOn(host, "readText");
	const write = vi.spyOn(host, "writeTextAtomic");
	const documents = registry(host);
	const subscribe = vi.spyOn(documents, "subscribePassive");
	const ids = Array.from({ length: 51 }, (_, i) => `embed-${i}`);
	const view = render(
		ids.map((id) => (
			<CanvasEmbed key={id} documents={documents} target={target} />
		)),
	);
	const embeds = screen.getAllByLabelText("Embedded note");
	expect(read).not.toHaveBeenCalled();
	act(() => {
		for (const embed of embeds.slice(0, 50)) show(embed, true);
	});
	expect(await screen.findAllByText("Ship the canvas")).toHaveLength(50);
	expect(read).toHaveBeenCalledExactlyOnceWith(target.row.path);

	const frames: FrameRequestCallback[] = [];
	vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
		frames.push(callback),
	);
	const editor = documents.subscribe({ path: target.row.path });
	const opened = (await editor.ready)?.opened;
	if (!opened) throw new Error("The pane could not open the shared note.");
	const pane = renderHook(() =>
		useNoteSession({
			host,
			writable: true,
			documents: () => documents,
			onUnsaved: vi.fn(),
		}),
	);
	act(() => pane.result.current.load(opened, target.row.path, editor));
	const final = editedBlocks("Ship it next week");
	expect(previewOf(final)).toBe(target.row.preview);
	act(() => {
		pane.result.current.editDoc(blocksToDoc(editedBlocks("Ship it Friday")));
		pane.result.current.editDoc(blocksToDoc(final));
	});
	expect(screen.getAllByText("Ship the canvas")).toHaveLength(50);
	expect(frames).toHaveLength(1);
	act(() => frames.shift()?.(0));
	expect(screen.getAllByText("Ship it next week")).toHaveLength(50);
	expect(screen.queryByText("Ship it Friday")).toBeNull();
	expect(write).not.toHaveBeenCalled();
	act(() => pane.result.current.discard());
	act(() => frames.shift()?.(0));
	expect(screen.getAllByText("Ship the canvas")).toHaveLength(50);

	const subscriptions = subscribe.mock.results.map((result) => result.value);
	expect(subscriptions).toHaveLength(50);
	const first = screen.getAllByLabelText("Embedded note")[0];
	if (!first) throw new Error("Expected an embed.");
	act(() => show(first, false));
	expect(subscriptions.filter((sub) => sub.current() !== null)).toHaveLength(
		49,
	);
	view.unmount();
	expect(subscriptions.every((sub) => sub.current() === null)).toBe(true);
});

const link = {
	type: "noteLink",
	attrs: { kind: "note", target: row.id ?? "", label: "Meeting link" },
};
const tick = (ms = 0) =>
	act(async () => {
		await vi.advanceTimersByTimeAsync(ms);
	});
const floating = () => screen.getByRole("dialog");
async function floatSetup(writable: boolean) {
	const host = await hostWithMeeting();
	if (!writable)
		await host.writeTextAtomic(
			row.path,
			serializeNote({
				...meeting,
				blocks: [
					{ id: "p3", type: "paragraph", parent: null, content: [link] },
				],
			}),
		);
	const documents = registry(host, writable);
	const links = {
		describe: () => "Meeting link",
		search: () => [],
		open: vi.fn(),
	};
	vi.useFakeTimers();
	render(
		<TooltipProvider>
			<NoteEditor
				editable
				doc={{ type: "doc", content: [{ type: "paragraph", content: [link] }] }}
				links={links}
				onChange={vi.fn()}
			/>
			<FloatingNotes
				documents={documents}
				host={host}
				links={links}
				locked={false}
				notes={[row]}
			/>
			<CanvasEmbed documents={documents} target={target} host={host} />
		</TooltipProvider>,
	);
	await tick(10);
	return {
		host,
		documents,
		chip: screen.getByRole("button", { name: "Meeting link" }),
	};
}

it("transfers the editor out of an embed and keeps the draft after closing the floating note", async () => {
	const { chip, documents, host } = await floatSetup(true);
	const embed = screen.getByLabelText("Embedded note");
	fireEvent.doubleClick(embed);
	await tick(20);
	const original = embed.querySelector(".tiptap");
	expect(original).toBeTruthy();
	fireEvent.pointerOver(chip);
	await tick(399);
	expect(screen.queryByRole("dialog")).toBeNull();
	await tick(1);
	expect(floating().querySelector(".tiptap")).toBeNull();

	chip.focus();
	fireEvent.keyDown(chip, { key: "Enter", altKey: true });
	const pin = within(floating()).getByRole("button", { name: "Pin window" });
	expect(document.activeElement).toBe(pin);
	fireEvent.pointerOut(chip, { relatedTarget: document.body });
	await tick(300);
	expect(floating()).toBeTruthy();

	chip.focus();
	fireEvent.keyDown(chip, { key: "Enter" });
	await tick(20);
	const entry = documents.subscribe({ path: row.path });
	await entry.ready;
	const editor = entry.editorSlot?.editor;
	if (!editor) throw new Error("The floating editor did not attach.");
	expect(editor.view.dom).toBe(original);
	expect(editor.view.dom).toBe(document.activeElement);
	expect(embed.querySelector(".tiptap")).toBeNull();
	act(() => {
		editor.commands.insertContent("Keep this draft ");
	});
	editor.view.dom.blur();
	await tick(300);
	expect(floating().contains(editor.view.dom)).toBe(true);
	fireEvent.keyDown(floating(), { key: "Escape" });
	await tick(20);
	expect(screen.queryByRole("dialog")).toBeNull();
	expect(document.activeElement).toBe(chip);
	await documents.flushAll();
	expect(await host.readText(row.path)).toContain("Keep this draft");
	entry.unsubscribe();
	documents.dispose();
});

it("keeps a read-only preview passive and limits nested windows to three", async () => {
	const { chip, documents } = await floatSetup(false);
	fireEvent.keyDown(chip, { key: "Enter" });
	await tick(20);
	for (let i = 0; i < 3; i++) {
		const panel = screen.getAllByRole("dialog").at(-1) as HTMLElement;
		fireEvent.pointerOver(
			within(panel).getByRole("button", { name: "Meeting link" }),
		);
		await tick(410);
	}
	expect(screen.getAllByRole("dialog")).toHaveLength(3);
	expect(document.querySelector(".floating-editor .tiptap")).toBeNull();
	documents.dispose();
});
