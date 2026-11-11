// @vitest-environment happy-dom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { loadTrashView, saveTrashView, TrashScreen } from "./TrashScreen";

afterEach(() => {
	cleanup();
	localStorage.clear();
});

const entries = [
	{
		trashPath: ".vaultops/trash/1/a.vnote",
		originalPath: "02. School/Lecture.vnote",
		deletedAt: new Date("2026-11-04T22:07:46"),
	},
	{
		trashPath: ".vaultops/trash/2/b.vnote",
		originalPath: "Ideas.vnote",
		deletedAt: null,
	},
];

function Harness(
	props: Omit<Parameters<typeof TrashScreen>[0], "view" | "onView">,
) {
	const [view, setView] = useState(loadTrashView);
	return (
		<TrashScreen
			{...props}
			view={view}
			onView={(next) => {
				setView(next);
				saveTrashView(next);
			}}
		/>
	);
}

function show(over: Partial<Parameters<typeof Harness>[0]> = {}) {
	const props = {
		entries,
		disabled: false,
		confirming: null,
		onConfirm: vi.fn(),
		onRestore: vi.fn(),
		onDelete: vi.fn(),
		...over,
	};
	render(<Harness {...props} />);
	return props;
}

it("shows each trashed note as a card, with its folder and date", () => {
	show();
	const items = document.querySelector(".trash-items") as HTMLElement;
	expect(items.getAttribute("data-view")).toBe("cards");
	const cards = within(items).getAllByRole("article");
	expect(cards).toHaveLength(2);
	expect(
		within(cards[0] as HTMLElement).getByText("Lecture.vnote"),
	).toBeTruthy();
	expect(
		within(cards[0] as HTMLElement).getByText("02. School/Lecture.vnote"),
	).toBeTruthy();
	expect(
		within(cards[1] as HTMLElement).getByText("Trash date unknown"),
	).toBeTruthy();
});

it("switches to a list, remembers it, and keeps the choice on one", async () => {
	const user = userEvent.setup();
	show();
	await user.click(screen.getByRole("radio", { name: "List" }));
	expect(
		document.querySelector(".trash-items")?.getAttribute("data-view"),
	).toBe("list");
	expect(localStorage.getItem("vaultops:trash-view")).toBe("list");
	// Clicking the chosen layout again leaves it on.
	await user.click(screen.getByRole("radio", { name: "List" }));
	expect(
		document.querySelector(".trash-items")?.getAttribute("data-view"),
	).toBe("list");
	cleanup();
	show();
	expect(
		document.querySelector(".trash-items")?.getAttribute("data-view"),
	).toBe("list");
});

it("restores, and asks before removing for good", async () => {
	const user = userEvent.setup();
	const props = show();
	await user.click(
		screen.getAllByRole("button", { name: "Restore" })[0] as HTMLElement,
	);
	expect(props.onRestore).toHaveBeenCalledWith(entries[0]?.trashPath);
	await user.click(
		screen.getAllByRole("button", {
			name: "Remove from trash",
		})[1] as HTMLElement,
	);
	// The first click only asks; nothing is deleted yet.
	expect(props.onConfirm).toHaveBeenCalledWith(entries[1]?.trashPath);
	expect(props.onDelete).not.toHaveBeenCalled();
});

it("says so when the trash is empty", () => {
	show({ entries: [] });
	expect(screen.getByText("The trash is empty.")).toBeTruthy();
});
