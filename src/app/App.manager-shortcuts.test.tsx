// @vitest-environment happy-dom
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createNote } from "../core/notes/repository";
import { shortcutKey } from "../core/settings/shortcuts";
import { MemoryHost } from "../host/memory-host";
import { App } from "./App";
import { loadVault } from "./session";
import { settings } from "./settings";

vi.mock("../editor/NoteEditor", () => ({
	NoteEditor: () => <div className="note-editor" />,
}));

const bind = (id: string, keys: string) =>
	(settings.set as (key: string, value: unknown) => unknown)(
		shortcutKey(id),
		keys,
	);

beforeEach(() => {
	localStorage.setItem("vaultops:sidebar-mode", "navigator");
});
afterEach(() => {
	cleanup();
	localStorage.clear();
	for (const id of ["open-templates", "open-resources"]) bind(id, "");
});

async function openApp() {
	const host = new MemoryHost();
	await loadVault(host);
	await createNote(host, "", "Alpha");
	render(<App host={host} />);
	await screen.findByRole("textbox", { name: "Title" });
}
const press = (key: string, extra: KeyboardEventInit = {}) =>
	act(() => {
		fireEvent.keyDown(window, { key, code: `Key${key}`, ...extra });
	});

it("opens neither manager by default, whatever is pressed", async () => {
	await openApp();
	press("T", { metaKey: true, altKey: true });
	press("R", { metaKey: true, altKey: true });
	press("T", { ctrlKey: true, altKey: true });
	expect(screen.queryByRole("dialog", { name: "Template manager" })).toBeNull();
	expect(screen.queryByRole("dialog", { name: "Resource manager" })).toBeNull();
});

it("opens the managers from the keys the user chose", async () => {
	await openApp();
	bind("open-templates", "Ctrl+Alt+T");
	bind("open-resources", "Ctrl+Alt+R");
	press("T", { ctrlKey: true, altKey: true });
	await waitFor(() =>
		expect(
			screen.getByRole("dialog", { name: "Template manager" }),
		).toBeTruthy(),
	);
	// The window takes focus when it opens; Escape inside it closes it.
	fireEvent.keyDown(document.activeElement as Element, { key: "Escape" });
	await waitFor(() =>
		expect(
			screen.queryByRole("dialog", { name: "Template manager" }),
		).toBeNull(),
	);
	press("R", { ctrlKey: true, altKey: true });
	await waitFor(() =>
		expect(
			screen.getByRole("dialog", { name: "Resource manager" }),
		).toBeTruthy(),
	);
});
