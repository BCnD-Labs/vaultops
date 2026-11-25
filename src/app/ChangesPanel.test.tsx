// @vitest-environment happy-dom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { MemoryHost } from "../host/memory-host";
import { ChangesPanel } from "./ChangesPanel";

afterEach(cleanup);

const note = (text: string) =>
	`${JSON.stringify({ format: "vaultops-note", v: 1, noteId: "n", title: "N" })}\n${JSON.stringify({ id: "a", type: "paragraph", parent: null, content: [{ type: "text", text }] })}\n`;

async function vault() {
	const host = new MemoryHost();
	await host.writeTextAtomic("N.vnote", note("Saved words"));
	await host.vcs.enable("Sam");
	await host.writeTextAtomic("N.vnote", note("Edited words"));
	await host.writeTextAtomic("New.vnote", note("Fresh"));
	return host;
}

function setup(host: MemoryHost, flush = async () => true) {
	const onFilesChanged = vi.fn();
	render(
		<ChangesPanel host={host} flush={flush} onFilesChanged={onFilesChanged} />,
	);
	return { onFilesChanged };
}

it("lists changed notes with summaries and shows the word changes on click", async () => {
	const user = userEvent.setup();
	const host = await vault();
	setup(host);
	const notes = await screen.findByRole("region", { name: "Notes" });
	expect(notes.textContent).toContain("N.vnote");
	expect(notes.textContent).toContain("1 changed");
	expect(notes.textContent).toContain("New note");
	await user.click(within(notes).getByRole("button", { name: /^N\.vnote/ }));
	const changes = screen
		.getAllByRole("region", { name: "Changes" })
		.at(-1) as HTMLElement;
	expect(changes.querySelector("del")?.textContent).toBe("Saved");
	expect(changes.querySelector("ins")?.textContent).toBe("Edited");
});

it("makes a save point of only the ticked files", async () => {
	const user = userEvent.setup();
	const host = await vault();
	setup(host);
	await user.click(
		await screen.findByRole("checkbox", {
			name: "Include New.vnote in the save point",
		}),
	);
	await user.click(screen.getByRole("button", { name: "Save point (1 of 2)" }));
	expect(await screen.findByText("Save point made.")).toBeTruthy();
	expect(host.historyLog.at(-1)).toBe("Edited N");
	expect((await host.vcs.status()).changes.map((c) => c.path)).toEqual([
		"New.vnote",
	]);
});

it("discards a change after asking, keeping the current version in recovery", async () => {
	const user = userEvent.setup();
	const host = await vault();
	const { onFilesChanged } = setup(host);
	const notes = await screen.findByRole("region", { name: "Notes" });
	const row = within(notes)
		.getByRole("button", { name: /^N\.vnote/ })
		.closest("li") as HTMLElement;
	await user.click(within(row).getByRole("button", { name: "Discard" }));
	await user.click(
		within(screen.getByRole("alert")).getByRole("button", { name: "Discard" }),
	);
	expect(
		await screen.findByText(/Discarded\. The version you had is kept in/),
	).toBeTruthy();
	expect(await host.readText("N.vnote")).toContain("Saved words");
	expect(onFilesChanged).toHaveBeenCalled();
});

it("says when history is off or nothing changed", async () => {
	setup(new MemoryHost());
	expect(await screen.findByText(/History is off/)).toBeTruthy();
	cleanup();
	const host = new MemoryHost();
	await host.vcs.enable("Sam");
	setup(host);
	expect(
		await screen.findByText("No changes since the last save point."),
	).toBeTruthy();
});
