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
