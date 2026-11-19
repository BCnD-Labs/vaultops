// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import type { Block } from "../../core/note-format";
import { createNote } from "../../core/notes/repository";
import { addDaysToKey, keyOfDate } from "../../core/planner/dates";
import { loadReview } from "../../core/review/storage";
import { MemoryHost } from "../../host/memory-host";
import { App } from "../App";
import { loadVault } from "../session";

vi.mock("../../editor/NoteEditor", () => ({ NoteEditor: () => null }));
afterEach(() => {
	cleanup();
	localStorage.clear();
});
it("flips, saves ratings, advances and finishes the queue", async () => {
	const host = new MemoryHost();
	await loadVault(host);
	await createNote(host, "", "Study", {
		blocks: ["First", "Second"].map(
			(id): Block => ({
				id,
				type: "paragraph",
				parent: null,
				attrs: { role: "flashcard" },
				content: [
					{ type: "text", text: `Q: ${id}` },
					{ type: "hardBreak" },
					{ type: "text", text: `A: Answer ${id}` },
				],
			}),
		),
	});
	const user = userEvent.setup();
	render(<App host={host} />);
	await user.click(await screen.findByRole("button", { name: /Review 2/ }));
	expect(await screen.findByText("First")).toBeTruthy();
	expect(screen.queryByText("Answer First")).toBeNull();
	await user.click(screen.getByRole("button", { name: "Show answer" }));
	expect(screen.getByText("Answer First")).toBeTruthy();
	await user.keyboard("1");
	expect(await screen.findByText("Second")).toBeTruthy();
	expect((await loadReview(host)).items.First?.due).toBe(
		addDaysToKey(keyOfDate(new Date()), 1),
	);
	await user.click(screen.getByRole("button", { name: "Show answer" }));
	await user.keyboard("4");
	expect(
		await screen.findByText("2 cards reviewed, next due tomorrow"),
	).toBeTruthy();
	await user.click(screen.getByRole("button", { name: "Back to notes" }));
	await user.click(screen.getByRole("button", { name: "Review" }));
	expect(
		await screen.findByText("No cards due, next due tomorrow"),
	).toBeTruthy();
});
