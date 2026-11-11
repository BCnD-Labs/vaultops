// @vitest-environment happy-dom
import {
	cleanup,
	fireEvent,
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
// The Details panel has tabs of its own, so look only inside the open-notes list.
const tabNames = () => {
	const list = screen.queryByRole("tablist", { name: "Open notes" });
	return list
		? within(list)
				.getAllByRole("tab")
				.map((tab) => tab.textContent)
		: [];
};
const titleBox = async () =>
	(await screen.findByRole("textbox", { name: "Title" })) as HTMLInputElement;

it("opens a tab for each note, switches between them and closes the active one", async () => {
	const host = await vaultWith("Alpha", "Beta", "Gamma");
	const user = userEvent.setup();
	render(<App host={host} />);
	expect((await titleBox()).value).toBe("Alpha");
	await waitFor(() => expect(tabNames()).toEqual(["Alpha"]));

	await user.click(screen.getByTitle("Beta.vnote"));
	await waitFor(() => expect(tabNames()).toEqual(["Alpha", "Beta"]));
	expect(
		within(screen.getByRole("tablist", { name: "Open notes" }))
			.getByRole("tab", { name: "Beta" })
			.getAttribute("aria-selected"),
	).toBe("true");

	await user.click(
		within(screen.getByRole("tablist", { name: "Open notes" })).getByRole(
			"tab",
			{ name: "Alpha" },
		),
	);
	await waitFor(() =>
		expect(
			(screen.getByRole("textbox", { name: "Title" }) as HTMLInputElement)
				.value,
		).toBe("Alpha"),
	);
	expect(tabNames()).toEqual(["Alpha", "Beta"]);

	// Closing the active tab shows the neighbor on its right.
	await user.click(screen.getByRole("button", { name: "Close Alpha" }));
	await waitFor(() => expect(tabNames()).toEqual(["Beta"]));
	await waitFor(() =>
		expect(
			(screen.getByRole("textbox", { name: "Title" }) as HTMLInputElement)
				.value,
		).toBe("Beta"),
	);
});

it("closes a background tab without leaving the open note", async () => {
	const host = await vaultWith("Alpha", "Beta");
	const user = userEvent.setup();
	render(<App host={host} />);
	await titleBox();
	await user.click(screen.getByTitle("Beta.vnote"));
	await waitFor(() => expect(tabNames()).toEqual(["Alpha", "Beta"]));
	await user.click(screen.getByRole("button", { name: "Close Alpha" }));
	await waitFor(() => expect(tabNames()).toEqual(["Beta"]));
	expect(
		(screen.getByRole("textbox", { name: "Title" }) as HTMLInputElement).value,
	).toBe("Beta");
});

it("leaves an empty editor and no tab bar when the last tab is closed", async () => {
	const host = await vaultWith("Only");
	const user = userEvent.setup();
	render(<App host={host} />);
	await titleBox();
	await user.click(await screen.findByRole("button", { name: "Close Only" }));
	await waitFor(() =>
		expect(screen.queryByRole("tablist", { name: "Open notes" })).toBeNull(),
	);
	expect(screen.queryByRole("textbox", { name: "Title" })).toBeNull();
});

it("keeps a renamed note's tab and brings the tabs back after a restart", async () => {
	const host = await vaultWith("Alpha", "Beta");
	const user = userEvent.setup();
	const { unmount } = render(<App host={host} />);
	await titleBox();
	await user.click(screen.getByTitle("Beta.vnote"));
	await waitFor(() => expect(tabNames()).toEqual(["Alpha", "Beta"]));
	await user.click(
		within(screen.getByRole("tablist", { name: "Open notes" })).getByRole(
			"tab",
			{ name: "Alpha" },
		),
	);
	await waitFor(() =>
		expect(
			(screen.getByRole("textbox", { name: "Title" }) as HTMLInputElement)
				.value,
		).toBe("Alpha"),
	);
	// Switching notes re-creates the title box, so find the current one.
	fireEvent.change(await titleBox(), { target: { value: "Alpha 2" } });
	await waitFor(() => expect(tabNames()).toEqual(["Alpha 2", "Beta"]), {
		timeout: 4000,
	});
	// The file is renamed when the title is saved; the tab follows the new path.
	await waitFor(
		() =>
			expect(
				JSON.parse(localStorage.getItem("vaultops:tabs:Memory vault") ?? "[]"),
			).toEqual(["Alpha 2.vnote", "Beta.vnote"]),
		{ timeout: 4000 },
	);

	unmount();
	render(<App host={host} />);
	await waitFor(() => expect(tabNames()).toEqual(["Alpha 2", "Beta"]));
});

it("drops the tab of a note that is gone before the app reopens", async () => {
	const host = await vaultWith("Alpha", "Beta");
	localStorage.setItem(
		"vaultops:tabs:Memory vault",
		JSON.stringify(["Beta.vnote", "Missing.vnote", "Alpha.vnote"]),
	);
	render(<App host={host} />);
	await waitFor(() => expect(tabNames()).toContain("Beta"));
	expect(tabNames()).not.toContain("Missing");
	expect(tabNames()).toHaveLength(2);
});
