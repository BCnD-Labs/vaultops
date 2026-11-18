// @vitest-environment happy-dom
import {
	act,
	cleanup,
	render,
	renderHook,
	screen,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { type Note, serializeNote } from "../core/note-format";
import type { EmbedTarget } from "../core/notes/canvas-embed";
import { previewOf } from "../core/notes/scan";
import { blocksToDoc } from "../editor/doc-blocks";
import { openNote } from "../editor/note-io";
import { MemoryHost } from "../host/memory-host";
import { CanvasEmbed } from "./CanvasEmbed";
import { createLiveDocuments } from "./live-documents";
import type { NoteRow } from "./session";
import { useNoteSession } from "./useNoteSession";

beforeEach(() => vi.stubGlobal("IntersectionObserver", undefined));
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
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

function registry(host: MemoryHost) {
	return createLiveDocuments(
		host,
		{ notes: [target.row], writable: true },
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
