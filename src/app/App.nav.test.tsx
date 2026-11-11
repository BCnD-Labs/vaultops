// @vitest-environment happy-dom
import {
	cleanup,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createNote } from "../core/notes/repository";
import { MemoryHost } from "../host/memory-host";
import { App } from "./App";
import { loadVault } from "./session";

vi.mock("../editor/NoteEditor", () => ({
	NoteEditor: () => <div className="note-editor" />,
}));

beforeEach(() => {
	localStorage.setItem("vaultops:sidebar-mode", "navigator");
});
afterEach(() => {
	cleanup();
	localStorage.clear();
});

async function vaultWith(...titles: string[]) {
	const host = new MemoryHost();
	await loadVault(host);
	for (const title of titles) await createNote(host, "", title);
	return host;
}
const shown = () =>
	(screen.getByRole("textbox", { name: "Title" }) as HTMLInputElement).value;
const button = (name: string) =>
	screen.getByRole("button", { name }) as HTMLButtonElement;
const tabNames = () =>
	within(screen.getByRole("tablist", { name: "Open notes" }))
		.getAllByRole("tab")
		.map((tab) => tab.textContent);

it("goes back and forward through opened notes without adding tabs or history", async () => {
	const host = await vaultWith("Alpha", "Beta", "Gamma");
	const user = userEvent.setup();
	render(<App host={host} />);
	await screen.findByRole("textbox", { name: "Title" });
	await waitFor(() => expect(shown()).toBe("Alpha"));
	expect(button("Back").disabled).toBe(true);
	expect(button("Forward").disabled).toBe(true);

	await user.click(screen.getByTitle("Beta.vnote"));
	await waitFor(() => expect(shown()).toBe("Beta"));
	await user.click(screen.getByTitle("Gamma.vnote"));
	await waitFor(() => expect(shown()).toBe("Gamma"));
	expect(button("Back").disabled).toBe(false);
	expect(button("Forward").disabled).toBe(true);

	await user.click(button("Back"));
	await waitFor(() => expect(shown()).toBe("Beta"));
	expect(button("Forward").disabled).toBe(false);
	await user.click(button("Back"));
	await waitFor(() => expect(shown()).toBe("Alpha"));
	expect(button("Back").disabled).toBe(true);
	await user.click(button("Forward"));
	await waitFor(() => expect(shown()).toBe("Beta"));
	// Walking the history opens no new tabs.
	expect(tabNames()).toEqual(["Alpha", "Beta", "Gamma"]);
});

it("drops the forward notes when a different note is opened after going back", async () => {
	const host = await vaultWith("Alpha", "Beta", "Gamma");
	const user = userEvent.setup();
	render(<App host={host} />);
	await waitFor(() => expect(shown()).toBe("Alpha"));
	await user.click(screen.getByTitle("Beta.vnote"));
	await waitFor(() => expect(shown()).toBe("Beta"));
	await user.click(button("Back"));
	await waitFor(() => expect(shown()).toBe("Alpha"));
	expect(button("Forward").disabled).toBe(false);
	await user.click(screen.getByTitle("Gamma.vnote"));
	await waitFor(() => expect(shown()).toBe("Gamma"));
	expect(button("Forward").disabled).toBe(true);
	await user.click(button("Back"));
	await waitFor(() => expect(shown()).toBe("Alpha"));
});

it("forgets a trashed note, so going back never reopens it", async () => {
	const host = await vaultWith("Alpha", "Beta", "Gamma");
	const user = userEvent.setup();
	render(<App host={host} />);
	await waitFor(() => expect(shown()).toBe("Alpha"));
	await user.click(screen.getByTitle("Beta.vnote"));
	await waitFor(() => expect(shown()).toBe("Beta"));
	await user.click(screen.getByTitle("Gamma.vnote"));
	await waitFor(() => expect(shown()).toBe("Gamma"));
	await user.click(button("Back"));
	await waitFor(() => expect(shown()).toBe("Beta"));
	await user.click(screen.getByRole("button", { name: "Note actions" }));
	await user.click(screen.getByRole("menuitem", { name: "Move to trash" }));
	await waitFor(() => expect(tabNames()).not.toContain("Beta"));
	expect(tabNames()).toEqual(["Alpha", "Gamma"]);
	// Every step the history still offers lands on a note that exists.
	for (let i = 0; i < 3 && !button("Back").disabled; i++) {
		await user.click(button("Back"));
		await waitFor(() => expect(shown()).not.toBe("Beta"));
	}
	while (!button("Forward").disabled) {
		await user.click(button("Forward"));
		await waitFor(() => expect(shown()).not.toBe("Beta"));
	}
});
