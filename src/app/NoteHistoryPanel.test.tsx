// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import { MemoryHost } from "../host/memory-host";
import { NoteHistoryPanel } from "./NoteHistoryPanel";

afterEach(cleanup);

const note = (title: string, text: string) =>
	`${JSON.stringify({ format: "vaultops-note", v: 1, noteId: "n", title })}\n${JSON.stringify({ id: "a", type: "paragraph", parent: null, content: [{ type: "text", text }] })}\n`;

it("says history is off, then that no save point has the note yet", async () => {
	const host = new MemoryHost();
	await host.writeTextAtomic("Trip.vnote", note("Trip", "one"));
	render(<NoteHistoryPanel host={host} path="Trip.vnote" />);
	expect(await screen.findByText(/History is off/)).toBeTruthy();
	cleanup();
	await host.vcs.enable("Sam");
	await host.writeTextAtomic("New.vnote", note("New", "x"));
	render(<NoteHistoryPanel host={host} path="New.vnote" />);
	expect(
		await screen.findByText(/No save points include this note yet/),
	).toBeTruthy();
});

it("lists the note's save points and shows an old version read-only, compared with now", async () => {
	const user = userEvent.setup();
	const host = new MemoryHost();
	await host.writeTextAtomic("Trip.vnote", note("Trip", "Old words"));
	await host.vcs.enable("Sam");
	await host.writeTextAtomic("Trip.vnote", note("Trip", "New words"));
	await host.vcs.savePoint("Rewrote the trip");
	await host.writeTextAtomic("Other.vnote", note("Other", "x"));
	await host.vcs.savePoint("Unrelated");
	render(<NoteHistoryPanel host={host} path="Trip.vnote" />);
	const rows = await screen.findAllByRole("button", { pressed: false });
	expect(
		rows.map((r) => r.querySelector(".note-history-subject")?.textContent),
	).toEqual(["Rewrote the trip", "History turned on"]);
	await user.click(screen.getByRole("button", { name: /History turned on/ }));
	expect(await screen.findByText("Old words")).toBeTruthy();
	expect(screen.getByRole("status").textContent).toContain(
		"Since then: 1 changed",
	);
	await user.click(screen.getByRole("button", { name: /Rewrote the trip/ }));
	expect(await screen.findByText("New words")).toBeTruthy();
	expect(screen.getByRole("status").textContent).toContain("Same as now");
});

it("restores an old version and copies a block back through onApply", async () => {
	const user = userEvent.setup();
	const host = new MemoryHost();
	await host.writeTextAtomic("Trip.vnote", note("Trip", "Old words"));
	await host.vcs.enable("Sam");
	await host.writeTextAtomic("Trip.vnote", note("Trip", "New words"));
	await host.vcs.savePoint("Rewrote");
	const labels: string[] = [];
	const onApply = async (
		build: (
			current: import("../core/note-format").Note | null,
		) => import("../core/note-format").Note,
		label: string,
	) => {
		labels.push(label);
		const { parseNote, serializeNote } = await import("../core/note-format");
		const current = parseNote(await host.readText("Trip.vnote")).note;
		await host.writeTextAtomic("Trip.vnote", serializeNote(build(current)));
		return null;
	};
	render(<NoteHistoryPanel host={host} path="Trip.vnote" onApply={onApply} />);
	await user.click(
		await screen.findByRole("button", { name: /History turned on/ }),
	);
	await user.click(
		await screen.findByRole("button", { name: "Copy back: Old words" }),
	);
	expect(
		await screen.findByText("Block copied back into the note."),
	).toBeTruthy();
	expect(await host.readText("Trip.vnote")).toContain("New words");
	expect(await host.readText("Trip.vnote")).toContain("Old words");
	await user.click(
		screen.getByRole("button", { name: "Restore this version" }),
	);
	expect(await screen.findByText(/Restored\./)).toBeTruthy();
	const text = await host.readText("Trip.vnote");
	expect(text).toContain("Old words");
	expect(text).not.toContain("New words");
	expect(labels[0]).toBe("copying a block back");
	expect(labels[1]).toMatch(/^restoring /);
});

it("shows why a change didn't happen", async () => {
	const user = userEvent.setup();
	const host = new MemoryHost();
	await host.writeTextAtomic("Trip.vnote", note("Trip", "Old words"));
	await host.vcs.enable("Sam");
	render(
		<NoteHistoryPanel
			host={host}
			path="Trip.vnote"
			onApply={async () => "A note couldn't be saved"}
		/>,
	);
	await user.click(
		await screen.findByRole("button", { name: /History turned on/ }),
	);
	await user.click(
		await screen.findByRole("button", { name: "Restore this version" }),
	);
	expect(await screen.findByText("A note couldn't be saved")).toBeTruthy();
});
