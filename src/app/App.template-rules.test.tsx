// @vitest-environment happy-dom
import {
	cleanup,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { createNote, loadNote } from "../core/notes/repository";
import { TEMPLATE_RULES_FILE } from "../core/notes/template-rules";
import { saveTemplate } from "../core/notes/templates";
import { MemoryHost } from "../host/memory-host";
import { App } from "./App";
import { loadVault } from "./session";

const notify = vi.hoisted(() => vi.fn());
vi.mock("../ui/notify", () => ({ notify }));

afterEach(() => {
	cleanup();
	localStorage.clear();
	notify.mockClear();
});

it.each(["present", "missing", "damaged"])(
	"creates a note for a rule whose template is %s",
	async (state) => {
		localStorage.setItem("vaultops:sidebar-mode", "navigator");
		const host = new MemoryHost();
		await loadVault(host);
		await host.makeFolder("Meetings");
		await createNote(host, "Meetings", "Existing");
		const template = ".vaultops/templates/Meeting.vnote";
		await host.makeFolder(".vaultops/templates");
		await host.writeTextAtomic(
			TEMPLATE_RULES_FILE,
			JSON.stringify({
				version: 1,
				rules: [{ folder: "Meetings", template, subfolders: true }],
			}),
		);
		if (state === "damaged") await host.writeTextAtomic(template, "broken");
		if (state === "present")
			await saveTemplate(host, "Meeting", {
				header: {
					format: "vaultops-note",
					v: 1,
					noteId: "template",
					title: "Meeting",
				},
				blocks: [
					{
						id: "a",
						type: "paragraph",
						parent: null,
						content: [{ type: "text", text: "Agenda for {{?Client}}" }],
					},
				],
			});

		const user = userEvent.setup();
		render(<App host={host} />);
		await screen.findByRole("textbox", { name: "Title" });
		await user.click(
			within(screen.getByRole("region", { name: "Navigation" })).getByRole(
				"button",
				{ name: /^Meetings/ },
			),
		);
		await user.click(screen.getByRole("button", { name: "New note" }));
		if (state === "present") {
			await user.type(
				await screen.findByRole("textbox", { name: "Client" }),
				"Ada{Enter}",
			);
			await waitFor(async () => {
				const { note } = await loadNote(host, "Meetings/Meeting.vnote");
				expect(note?.blocks[0]?.content).toEqual([
					{ type: "text", text: "Agenda for Ada" },
				]);
			});
		} else {
			await waitFor(async () =>
				expect(await host.kindOf("Meetings/Untitled.vnote")).toBe("file"),
			);
			expect(notify).toHaveBeenCalledWith(
				expect.stringContaining("blank note"),
			);
		}
	},
);
