import { describe, expect, it } from "vitest";
import { createAndLoad, loadVault } from "../app/session";
import { MemoryHost } from "../host/memory-host";
import { createAutosave } from "./autosave";
import { openNote } from "./note-io";
import { createQuitGuard } from "./quit";
import { saveDraft } from "./save-draft";

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

describe("create, edit, quit, reopen", () => {
	it("keeps an edit made just before quitting, and its new title", async () => {
		const host = new MemoryHost();
		await host.chooseVault();
		const view = await loadVault(host);
		const made = await createAndLoad(host, view);
		expect(made.path).not.toBeNull();
		let opened = await openNote(host, made.path as string);

		const auto = createAutosave({
			save: async (draft: { doc: object; title: string }) => {
				const result = await saveDraft(host, opened, draft as never);
				if (!result.ok) return result;
				opened = { ...opened, path: result.path, note: result.note };
				return { ok: true };
			},
		});
		await host.onCloseRequested(createQuitGuard(() => auto.flush()));

		auto.change({ doc: doc("buy milk"), title: "Shopping" });
		// No pause: the person quits right after typing.
		expect(await host.simulateClose()).toBe(true);

		const again = await loadVault(host);
		expect(again.notes.map((n) => n.title)).toEqual(["Shopping"]);
		const reopened = await openNote(host, again.notes[0]?.path as string);
		expect(JSON.stringify(reopened.doc)).toContain("buy milk");
		expect(reopened.note?.header.noteId).toBe(opened.note?.header.noteId);
	});

	it("stays put and keeps the edit in memory when saving fails", async () => {
		const host = new MemoryHost();
		await host.chooseVault();
		const made = await createAndLoad(host, await loadVault(host));
		const opened = await openNote(host, made.path as string);
		let failing = true;
		const auto = createAutosave({
			save: async (draft: { doc: object; title: string }) => {
				if (failing) return { ok: false as const, message: "disk full" };
				const result = await saveDraft(host, opened, draft as never);
				return result.ok ? { ok: true as const } : result;
			},
		});
		auto.change({ doc: doc("precious"), title: "Untitled" });
		expect(await auto.flush()).toBe(false); // App's settle() refuses to leave
		expect(auto.getState().kind).toBe("failed");
		failing = false;
		expect(await auto.retry()).toBe(true);
		const reopened = await openNote(host, made.path as string);
		expect(JSON.stringify(reopened.doc)).toContain("precious");
	});
});
