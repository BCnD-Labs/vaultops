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
import { withProps } from "../core/notes/properties";
import { createNote, loadNote, saveNote } from "../core/notes/repository";
import { tagsOf } from "../core/notes/tags";
import { MemoryHost } from "../host/memory-host";
import { App } from "./App";
import { loadVault } from "./session";

vi.mock("../editor/NoteEditor", () => ({
	NoteEditor: () => <div data-testid="editor" />,
}));

beforeEach(() => {
	localStorage.setItem("vaultops:sidebar-mode", "navigator");
});
afterEach(() => {
	cleanup();
	localStorage.clear();
});

async function tagged(host: MemoryHost, title: string, tags: string[]) {
	const made = await createNote(host, "", title);
	await saveNote(host, made.path, {
		...made.note,
		header: withProps(made.note.header, {
			tags: { type: "list", value: tags },
		}),
	});
	return made.path;
}

const tagsAt = async (host: MemoryHost, path: string) =>
	tagsOf(((await loadNote(host, path)).note?.header.props as never) ?? null);

it("renames a parent tag in every note: the open note through its session, the others on disk", async () => {
	const user = userEvent.setup();
	const host = new MemoryHost();
	await loadVault(host);
	const a = await tagged(host, "Alpha", ["work/clients", "work/clients/acme"]);
	const b = await tagged(host, "Beta", ["work/clients/zed", "idea"]);
	render(<App host={host} />);
	await screen.findByRole("textbox", { name: "Title" });
	await user.click(screen.getByRole("tab", { name: "Tags" }));
	const tags = await screen.findByRole("navigation", { name: "Tags" });
	await user.click(within(tags).getByRole("button", { name: /#work/ }));
	await user.click(
		screen.getByRole("button", { name: /Rename or merge #work/ }),
	);
	const name = screen.getByRole("textbox", { name: "New tag name" });
	await user.clear(name);
	await user.type(name, "job");
	await user.click(screen.getByRole("button", { name: "Continue" }));
	expect(await screen.findByText("2 notes will change.")).toBeTruthy();
	await user.click(screen.getByRole("button", { name: "Rename" }));
	expect(await screen.findByText(/2 notes updated/)).toBeTruthy();
	await waitFor(async () => {
		expect(await tagsAt(host, a)).toEqual(["job/clients", "job/clients/acme"]);
		expect(await tagsAt(host, b)).toEqual(["job/clients/zed", "idea"]);
	});
	// The tree follows, and the picked tag is now the new name.
	const tree = screen.getByRole("navigation", { name: "Tags" });
	expect(within(tree).getByRole("button", { name: /#job/ })).toBeTruthy();
	expect(within(tree).queryByRole("button", { name: /#work/ })).toBeNull();
});
