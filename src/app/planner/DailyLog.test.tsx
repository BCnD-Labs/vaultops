// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Note } from "../../core/note-format";
import { addEntry, addSection, newLogNote } from "../../core/planner/log";
import { DailyLog } from "./DailyLog";

afterEach(cleanup);

const emptyNote = (): Note => ({
	header: { format: "vaultops-note", v: 1, noteId: "n" },
	blocks: [],
});
const withEntries = (): Note => {
	let note = emptyNote();
	note = addEntry(note, null, "first thing");
	note = addSection(note, "Evening") as Note;
	const heading = note.blocks.find((b) => b.type === "heading");
	note = addEntry(note, heading?.id ?? null, "late thing");
	return note;
};

function setup(
	over: Partial<React.ComponentProps<typeof DailyLog>> = {},
	note: Note | null = null,
) {
	const props = {
		date: "2026-11-07",
		today: "2026-11-07",
		writable: true,
		load: vi.fn(async () => note),
		onDate: vi.fn(),
		onAddEntry: vi.fn(async () => {}),
		onAddSection: vi.fn(async () => {}),
		onOpen: vi.fn(),
		version: 0,
		...over,
	};
	render(<DailyLog {...props} />);
	return props;
}

describe("DailyLog", () => {
	it("shows an empty state and no 'open as a note' when the day has no note", async () => {
		const p = setup();
		expect(screen.getByText("Nothing logged here yet.")).toBeTruthy();
		await waitFor(() => expect(p.load).toHaveBeenCalledWith("2026-11-07"));
		expect(
			screen.queryByRole("button", { name: "Open day as a note" }),
		).toBeNull();
		expect(screen.queryByRole("tablist")).toBeNull();
	});

	it("lists the main entries and opens the day as a note", async () => {
		const p = setup({}, withEntries());
		expect(await screen.findByText("first thing")).toBeTruthy();
		await userEvent.click(
			screen.getByRole("button", { name: "Open day as a note" }),
		);
		expect(p.onOpen).toHaveBeenCalledWith("2026-11-07");
	});

	it("switches between the main log and a named section", async () => {
		setup({}, withEntries());
		await screen.findByText("first thing");
		await userEvent.click(screen.getByRole("tab", { name: "Evening" }));
		expect(await screen.findByText("late thing")).toBeTruthy();
		expect(screen.queryByText("first thing")).toBeNull();
	});

	it("saves the draft only when asked, then clears it", async () => {
		const p = setup();
		const box = screen.getByLabelText("Log entry for 2026-11-07");
		expect(screen.queryByRole("button", { name: "Save entry" })).toBeNull();
		await userEvent.type(box, "wrote tests");
		expect(p.onAddEntry).not.toHaveBeenCalled();
		await userEvent.click(screen.getByRole("button", { name: "Save entry" }));
		expect(p.onAddEntry).toHaveBeenCalledWith(
			"2026-11-07",
			null,
			"wrote tests",
		);
		await waitFor(() => expect((box as HTMLTextAreaElement).value).toBe(""));
	});

	it("keeps the draft and shows the message when saving fails", async () => {
		setup({
			onAddEntry: vi.fn(async () => {
				throw new Error("disk full");
			}),
		});
		const box = screen.getByLabelText(
			"Log entry for 2026-11-07",
		) as HTMLTextAreaElement;
		await userEvent.type(box, "keep me");
		await userEvent.click(screen.getByRole("button", { name: "Save entry" }));
		expect((await screen.findByRole("alert")).textContent).toBe("disk full");
		expect(box.value).toBe("keep me");
	});

	it("a prompt button starts the draft and appends on a new line", async () => {
		setup();
		const box = screen.getByLabelText(
			"Log entry for 2026-11-07",
		) as HTMLTextAreaElement;
		await userEvent.click(screen.getByRole("button", { name: "+ Shipped" }));
		expect(box.value).toBe("Shipped: ");
		await userEvent.click(screen.getByRole("button", { name: "+ Learned" }));
		expect(box.value).toBe("Shipped: \nLearned: ");
	});

	it("keeps a separate draft per day", async () => {
		const onDate = vi.fn();
		const load = vi.fn(async () => null);
		const base = {
			today: "2026-11-07",
			writable: true,
			load,
			onDate,
			onAddEntry: vi.fn(async () => {}),
			onAddSection: vi.fn(async () => {}),
			onOpen: vi.fn(),
			version: 0,
		};
		const view = render(<DailyLog {...base} date="2026-11-07" />);
		await userEvent.type(
			screen.getByLabelText("Log entry for 2026-11-07"),
			"mon",
		);
		view.rerender(<DailyLog {...base} date="2026-11-08" />);
		expect(
			(screen.getByLabelText("Log entry for 2026-11-08") as HTMLTextAreaElement)
				.value,
		).toBe("");
		view.rerender(<DailyLog {...base} date="2026-11-07" />);
		expect(
			(screen.getByLabelText("Log entry for 2026-11-07") as HTMLTextAreaElement)
				.value,
		).toBe("mon");
	});

	it("moves a day at a time and Today is disabled on today", async () => {
		const p = setup();
		await userEvent.click(
			screen.getByRole("button", { name: "Previous log day" }),
		);
		expect(p.onDate).toHaveBeenLastCalledWith("2026-11-06");
		await userEvent.click(screen.getByRole("button", { name: "Next log day" }));
		expect(p.onDate).toHaveBeenLastCalledWith("2026-11-08");
		expect(
			(screen.getByRole("button", { name: "Today" }) as HTMLButtonElement)
				.disabled,
		).toBe(true);
	});

	it("Today returns from another day", async () => {
		const p = setup({ date: "2026-11-01" });
		await userEvent.click(screen.getByRole("button", { name: "Today" }));
		expect(p.onDate).toHaveBeenCalledWith("2026-11-07");
	});

	it("adds a named section, then closes the naming form", async () => {
		const p = setup();
		await userEvent.click(screen.getByRole("button", { name: /Section/ }));
		const add = screen.getByRole("button", {
			name: "Add",
		}) as HTMLButtonElement;
		expect(add.disabled).toBe(true);
		await userEvent.type(screen.getByLabelText("Section name"), "Evening");
		await userEvent.click(add);
		expect(p.onAddSection).toHaveBeenCalledWith("2026-11-07", "Evening");
		await waitFor(() =>
			expect(screen.queryByLabelText("Section name")).toBeNull(),
		);
	});

	it("cancel closes the naming form without saving", async () => {
		const p = setup();
		await userEvent.click(screen.getByRole("button", { name: /Section/ }));
		await userEvent.type(screen.getByLabelText("Section name"), "x");
		await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
		expect(screen.queryByLabelText("Section name")).toBeNull();
		expect(p.onAddSection).not.toHaveBeenCalled();
	});

	it("shows a section error and leaves the form open", async () => {
		setup({
			onAddSection: vi.fn(async () => {
				throw new Error("A day can have up to three named sections.");
			}),
		});
		await userEvent.click(screen.getByRole("button", { name: /Section/ }));
		await userEvent.type(screen.getByLabelText("Section name"), "Four");
		await userEvent.click(screen.getByRole("button", { name: "Add" }));
		expect((await screen.findByRole("alert")).textContent).toMatch(/three/);
		expect(screen.getByLabelText("Section name")).toBeTruthy();
	});

	it("hides the section button at three sections", async () => {
		let note = newLogNote("2026-11-07") as Note;
		for (const n of ["A", "B", "C"]) note = addSection(note, n) as Note;
		setup({}, note);
		await screen.findByRole("tab", { name: "C" });
		expect(screen.queryByRole("button", { name: /Section/ })).toBeNull();
	});

	it("is read-only when the vault is not writable", async () => {
		setup({ writable: false });
		expect(
			(screen.getByLabelText("Log entry for 2026-11-07") as HTMLTextAreaElement)
				.disabled,
		).toBe(true);
		expect(screen.queryByRole("button", { name: /Section/ })).toBeNull();
		expect(
			(screen.getByRole("button", { name: "+ Shipped" }) as HTMLButtonElement)
				.disabled,
		).toBe(true);
	});

	it("reads the log again when the version changes", async () => {
		const load = vi.fn(async () => null);
		const base = {
			date: "2026-11-07",
			today: "2026-11-07",
			writable: true,
			load,
			onDate: vi.fn(),
			onAddEntry: vi.fn(async () => {}),
			onAddSection: vi.fn(async () => {}),
			onOpen: vi.fn(),
		};
		const view = render(<DailyLog {...base} version={0} />);
		await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
		view.rerender(<DailyLog {...base} version={1} />);
		await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
	});

	it("falls back to the empty log when loading fails", async () => {
		setup({
			load: vi.fn(async () => {
				throw new Error("unreadable");
			}),
		});
		expect(screen.getByText("Nothing logged here yet.")).toBeTruthy();
	});
});

describe("DailyLog links and save feedback", () => {
	const targets = [
		{ kind: "note" as const, target: "n-1", label: "Trip plan" },
		{ kind: "note" as const, target: "t-1", label: "Fix bug", hint: "Task" },
	];
	it("saves picked links with the entry, then shows 'Entry saved'", async () => {
		const p = setup({ linkTargets: targets });
		await userEvent.type(
			screen.getByLabelText("Log entry for 2026-11-07"),
			"met",
		);
		await userEvent.click(screen.getByRole("button", { name: "Link" }));
		await userEvent.type(
			screen.getByLabelText("Find a note or task to link"),
			"fix",
		);
		await userEvent.click(
			screen.getByRole("button", { name: "Fix bug (Task)" }),
		);
		await userEvent.click(screen.getByRole("button", { name: "Save entry" }));
		expect(p.onAddEntry).toHaveBeenCalledWith("2026-11-07", null, "met", [
			targets[1],
		]);
		expect(await screen.findByText("Entry saved")).toBeTruthy();
	});
	it("keeps the draft and shows the error when saving fails", async () => {
		setup({
			onAddEntry: vi.fn(async () => {
				throw new Error("disk full");
			}),
		});
		const box = screen.getByLabelText("Log entry for 2026-11-07");
		await userEvent.type(box, "keep me");
		await userEvent.click(screen.getByRole("button", { name: "Save entry" }));
		expect((await screen.findByRole("alert")).textContent).toBe("disk full");
		expect((box as HTMLTextAreaElement).value).toBe("keep me");
		expect(screen.queryByText("Entry saved")).toBeNull();
	});
	it("opens a saved link", async () => {
		const onOpenLink = vi.fn();
		const note = addEntry(emptyNote(), null, "see", [targets[0] as never]);
		setup({ linkTargets: targets, onOpenLink }, note);
		await userEvent.click(
			await screen.findByRole("button", { name: "Trip plan" }),
		);
		expect(onOpenLink).toHaveBeenCalledWith(targets[0]);
	});
});
