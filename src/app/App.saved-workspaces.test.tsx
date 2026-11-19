// @vitest-environment happy-dom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import { createNote } from "../core/notes/repository";
import { MemoryHost } from "../host/memory-host";
import { App } from "./App";
import { loadVault } from "./session";
import { isMacPlatform } from "./shortcuts";

afterEach(() => {
	cleanup();
	localStorage.clear();
});

it("saves and switches back to the same tabs and active note from the palette", async () => {
	const host = new MemoryHost();
	await loadVault(host);
	await createNote(host, "", "Alpha");
	await createNote(host, "", "Beta");
	await createNote(host, "", "Gamma");
	render(<App host={host} />);
	const user = userEvent.setup();
	const command = async (label: string) => {
		const mac = isMacPlatform();
		fireEvent.keyDown(window, { key: "k", metaKey: mac, ctrlKey: !mac });
		const palette = await screen.findByRole("dialog", {
			name: "Find or create a note",
		});
		await user.click(await within(palette).findByText(label));
	};

	await screen.findByRole("textbox", { name: "Title" });
	await command("Alpha");
	await command("Beta");
	await command("Save workspace as…");
	const dialog = await screen.findByRole("dialog", {
		name: "Save workspace as",
	});
	await user.type(
		within(dialog).getByRole("textbox", { name: "Workspace name" }),
		"Writing",
	);
	await user.click(within(dialog).getByRole("button", { name: "Save" }));

	await command("Gamma");
	expect(
		await screen.findByRole("tab", { name: "Gamma", selected: true }),
	).toBeTruthy();
	await command("Switch workspace: Writing");
	expect(
		await screen.findByRole("tab", { name: "Beta", selected: true }),
	).toBeTruthy();
	const strip = screen.getByRole("tablist", { name: "Open notes" });
	expect(
		within(strip)
			.getAllByRole("tab")
			.map((tab) => tab.textContent),
	).toEqual(["Alpha", "Beta"]);
});
