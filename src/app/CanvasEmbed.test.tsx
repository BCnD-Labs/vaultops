// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { type Note, serializeNote } from "../core/note-format";
import type { EmbedTarget } from "../core/notes/canvas-embed";
import { MemoryHost } from "../host/memory-host";
import { CanvasEmbed } from "./CanvasEmbed";
import type { NoteRow } from "./session";

afterEach(cleanup);

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
			content: [{ type: "text", text: "Agenda" }],
		},
		{
			id: "p2",
			type: "paragraph",
			parent: null,
			content: [{ type: "text", text: "Ship the canvas" }],
		},
	],
};

const row = (patch: Partial<NoteRow> = {}): NoteRow => ({
	path: "Meeting.vnote",
	id: "n-meet",
	title: "Meeting",
	preview: "Agenda",
	readOnly: false,
	kind: "note",
	tags: [],
	...patch,
});

async function hostWithMeeting() {
	const host = new MemoryHost();
	await host.writeTextAtomic("Meeting.vnote", serializeNote(meeting));
	return host;
}

it("shows the embedded note read-only, with its title", async () => {
	const host = await hostWithMeeting();
	const write = vi.spyOn(host, "writeTextAtomic");
	render(<CanvasEmbed host={host} target={{ status: "found", row: row() }} />);
	expect(await screen.findByText("Ship the canvas")).toBeTruthy();
	expect(screen.getByText("Agenda")).toBeTruthy();
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
		<CanvasEmbed
			host={host}
			target={{ status: "found", row: row() }}
			onOpen={onOpen}
		/>,
	);
	await user.click(screen.getByRole("button", { name: "Open Meeting" }));
	expect(onOpen).toHaveBeenCalledWith("Meeting.vnote");
});

it("reads the note again when its preview changes in the list", async () => {
	const host = await hostWithMeeting();
	const view = render(
		<CanvasEmbed host={host} target={{ status: "found", row: row() }} />,
	);
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
	view.rerender(
		<CanvasEmbed
			host={host}
			target={{ status: "found", row: row({ preview: "Ship it Friday" }) }}
		/>,
	);
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
			<CanvasEmbed host={new MemoryHost()} target={target} onOpen={vi.fn()} />,
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
		<CanvasEmbed host={host} target={{ status: "found", row: row() }} />,
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
	render(<CanvasEmbed host={host} target={{ status: "found", row: row() }} />);
	await waitFor(() =>
		expect(screen.getByText(/could not be read/)).toBeTruthy(),
	);
});

it("marks itself as staying on the canvas when the canvas is locked", () => {
	render(
		<CanvasEmbed
			host={new MemoryHost()}
			target={{ status: "missing" }}
			locked
		/>,
	);
	const article = screen.getByLabelText("Embedded note");
	expect(article.className).toContain("canvas-item-pinned");
	expect(article.getAttribute("title")).toMatch(/stay on the canvas/);
});
