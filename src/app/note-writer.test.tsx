// @vitest-environment happy-dom
import { act, renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { parseNote } from "../core/note-format";
import { headerProps, type Props } from "../core/notes/properties";
import { createNote } from "../core/notes/repository";
import { openNote } from "../editor/note-io";
import { MemoryHost } from "../host/memory-host";
import { createLiveDocuments, READ_ONLY_NOTE_MESSAGE } from "./live-documents";
import { createNoteWriter } from "./note-writer";
import { loadVault } from "./session";
import { useNoteSession } from "./useNoteSession";

const status = (value: string) => (props: Props) => ({
	ok: true as const,
	props: { ...props, Status: { type: "text", value } },
});

async function setup() {
	const host = new MemoryHost();
	await loadVault(host);
	const { path } = await createNote(host, "", "Alpha");
	const { notes } = await loadVault(host);
	const noteId = notes.find((note) => note.path === path)?.id ?? "";
	const onSaved = vi.fn();
	const registry = createLiveDocuments(
		host,
		{ notes, writable: true },
		{ open: (p) => openNote(host, p), onSaved },
	);
	const writer = createNoteWriter({ documents: () => registry, onSaved });
	const propsOnDisk = async () =>
		headerProps(parseNote(await host.readText(path)).note?.header);
	return { host, path, noteId, registry, writer, onSaved, propsOnDisk };
}

it("changes a note open in two panes in both, and neither pane saves its old props over it", async () => {
	const { host, path, noteId, registry, writer } = await setup();
	const options = {
		host,
		writable: true,
		documents: () => registry,
		onUnsaved: vi.fn(),
	};
	const left = renderHook(() => useNoteSession(options));
	const right = renderHook(() => useNoteSession(options));
	for (const pane of [left, right]) {
		const binding = pane.result.current.subscribe(path);
		const document = await act(async () => binding?.ready);
		act(() => {
			if (document?.opened)
				pane.result.current.load(document.opened, path, binding);
		});
	}
	expect(left.result.current.opened?.editable).toBe(true);
	expect(right.result.current.opened?.editable).toBe(true);

	let result: unknown;
	await act(async () => {
		result = await writer.setProps(noteId, status("Reading"));
	});
	expect(result).toEqual({ ok: true });
	// Both panes show it at once, before anything is saved.
	const reading = { type: "text", value: "Reading" };
	expect(left.result.current.props?.Status).toEqual(reading);
	expect(right.result.current.props?.Status).toEqual(reading);

	// The pane that was not written through edits next: its save keeps the value.
	act(() => right.result.current.editTitle("Alpha two"));
	await act(async () => {
		expect(await right.result.current.flush()).toBe(true);
	});
	const saved = parseNote(
		await host.readText(right.result.current.livePath ?? path),
	).note?.header;
	expect(saved?.title).toBe("Alpha two");
	expect(headerProps(saved)?.Status).toEqual(reading);
});

it("writes a closed note atomically and tells the note list", async () => {
	const { host, noteId, writer, onSaved, propsOnDisk } = await setup();
	const atomic = vi.spyOn(host, "writeTextAtomic");
	expect(await writer.setProps(noteId, status("Done"))).toMatchObject({
		ok: true,
	});
	expect(atomic).toHaveBeenCalledTimes(1);
	expect((await propsOnDisk())?.Status).toEqual({
		type: "text",
		value: "Done",
	});
	expect(onSaved.mock.calls[0]?.[0].fields.status.value).toBe("Done");
});

it("joins edits made while a write waits, so none is lost", async () => {
	const { host, noteId, writer, propsOnDisk } = await setup();
	const atomic = vi.spyOn(host, "writeTextAtomic");
	const both = await Promise.all([
		writer.setProps(noteId, status("One")),
		writer.setProps(noteId, (props) => ({
			ok: true,
			props: { ...props, Pages: { type: "number", value: 3 } },
		})),
	]);
	expect(both.every((result) => result.ok)).toBe(true);
	expect(atomic).toHaveBeenCalledTimes(1);
	expect(await propsOnDisk()).toMatchObject({
		Status: { value: "One" },
		Pages: { value: 3 },
	});
});

it("never writes over a file that changed since the registry read it", async () => {
	const { host, path, noteId, registry, writer } = await setup();
	const view = registry.subscribePassive(noteId, () => {});
	await view.ready;
	const changed = (await host.readText(path)).replace("Alpha", "Changed");
	await host.writeTextAtomic(path, changed);
	const result = await writer.setProps(noteId, status("Late"));
	expect(result.ok).toBe(false);
	expect(await host.readText(path)).toBe(changed);
});

it("refuses a note this version can't read", async () => {
	const { host, path, noteId, writer } = await setup();
	const newer = (await host.readText(path)).replace(
		'"type":"paragraph"',
		'"type":"hologram"',
	);
	await host.writeTextAtomic(path, newer);
	expect(await writer.setProps(noteId, status("No"))).toEqual({
		ok: false,
		message: READ_ONLY_NOTE_MESSAGE,
	});
	expect(await host.readText(path)).toBe(newer);
});
