// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createNote } from "../core/notes/repository";
import { MemoryHost } from "../host/memory-host";
import { App } from "./App";
import { loadVault } from "./session";

vi.mock("../editor/NoteEditor", () => ({
	NoteEditor: ({ onChange }: { onChange: (doc: unknown) => void }) => (
		<button
			type="button"
			onClick={() =>
				onChange({
					type: "doc",
					content: [
						{
							type: "paragraph",
							content: [{ type: "text", text: "one two three" }],
						},
					],
				})
			}
		>
			Type
		</button>
	),
}));

beforeEach(() => {
	localStorage.setItem("vaultops:sidebar-mode", "navigator");
});
afterEach(() => {
	cleanup();
	localStorage.clear();
});

it("shows the vault and counts for the open note, and recounts after typing pauses", async () => {
	const host = new MemoryHost();
	await loadVault(host);
	await createNote(host, "", "Alpha");
	const user = userEvent.setup();
	const { container } = render(<App host={host} />);
	await screen.findByRole("textbox", { name: "Title" });
	const bar = () => container.querySelector(".status-bar") as HTMLElement;
	await waitFor(() => expect(bar().textContent).toContain("0 words"));
	expect(bar().textContent).toContain("Memory vault");
	await user.click(screen.getByRole("button", { name: "Type" }));
	await waitFor(() => expect(bar().textContent).toContain("3 words"));
	expect(bar().textContent).toContain("13 characters");
});

it("shows only the vault when no note is open", async () => {
	const host = new MemoryHost();
	await loadVault(host);
	const { container } = render(<App host={host} />);
	await waitFor(() =>
		expect(container.querySelector(".status-bar")).not.toBeNull(),
	);
	expect(container.querySelector(".status-bar-counts")).toBeNull();
});
