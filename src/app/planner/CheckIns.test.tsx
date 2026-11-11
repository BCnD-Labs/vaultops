// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import type { Note } from "../../core/note-format";
import {
	applyCheckIn,
	DEFAULT_CHECK_IN_CONFIG,
	emptyCheckIn,
	resolveConfig,
	setScale,
} from "../../core/planner/check-in";
import { newLogNote } from "../../core/planner/log";
import { CheckIns } from "./CheckIns";

afterEach(cleanup);

const note = (): Note => newLogNote("2026-11-09") as Note;
const noon = new Date(2026, 10, 9, 9, 0);

function setup(over: Partial<React.ComponentProps<typeof CheckIns>> = {}) {
	const onSave = vi.fn(async () => {});
	render(
		<CheckIns
			config={DEFAULT_CHECK_IN_CONFIG}
			note={note()}
			day="2026-11-09"
			isToday
			now={noon}
			writable
			onSave={onSave}
			{...over}
		/>,
	);
	return onSave;
}

const slot = (name: string) =>
	screen.getByRole("button", { name: `${name} check-in` });

it("shows one button per enabled slot on a row, all closed, the current one marked", () => {
	setup({ config: resolveConfig({ enabled: { afternoon: false } }) });
	expect(slot("Morning").getAttribute("aria-expanded")).toBe("false");
	expect(slot("Evening").getAttribute("aria-expanded")).toBe("false");
	expect(
		screen.queryByRole("button", { name: "Afternoon check-in" }),
	).toBeNull();
	expect(slot("Morning").hasAttribute("data-current")).toBe(true);
	expect(slot("Evening").hasAttribute("data-current")).toBe(false);
	expect(screen.queryByRole("button", { name: /^Save/ })).toBeNull();
});

it("marks no slot as now on a day that is not today", () => {
	setup({ isToday: false });
	for (const n of ["Morning", "Afternoon", "Evening"])
		expect(slot(n).hasAttribute("data-current")).toBe(false);
});

it("opens one slot's form at a time, and closes it on a second click", async () => {
	const user = userEvent.setup();
	setup();
	await user.click(slot("Morning"));
	expect(slot("Morning").getAttribute("aria-expanded")).toBe("true");
	expect(screen.getByRole("button", { name: "Save morning check-in" }));
	await user.click(slot("Evening"));
	expect(slot("Morning").getAttribute("aria-expanded")).toBe("false");
	expect(screen.getByRole("button", { name: "Save evening check-in" }));
	await user.click(slot("Evening"));
	expect(screen.queryByRole("button", { name: /^Save/ })).toBeNull();
});

it("renders nothing when every slot is off", () => {
	setup({
		config: resolveConfig({
			enabled: { morning: false, afternoon: false, evening: false },
		}),
	});
	expect(screen.queryByRole("group", { name: "Check-ins" })).toBeNull();
});

it("saves the picked scales and note, and a pick can be cleared", async () => {
	const user = userEvent.setup();
	const onSave = setup();
	await user.click(slot("Morning"));
	const save = screen.getByRole("button", { name: "Save morning check-in" });
	expect((save as HTMLButtonElement).disabled).toBe(true);
	const energy = screen.getByRole("radiogroup", { name: "Morning energy" });
	await user.click(energy.querySelector('[aria-label^="4"]') as Element);
	await user.type(screen.getByRole("textbox", { name: "Note" }), "fine");
	await user.click(save);
	expect(onSave).toHaveBeenCalledWith("2026-11-09", "morning", {
		scales: { energy: 4 },
		note: "fine",
	});
});

it("turns a slot with an entry green, with its summary on hover", () => {
	const stored = applyCheckIn(
		note(),
		"evening",
		setScale(emptyCheckIn(), "mood", 3),
	);
	setup({ note: stored });
	expect(slot("Evening").hasAttribute("data-done")).toBe(true);
	expect(slot("Evening").getAttribute("title")).toBe("Mood 3");
	expect(slot("Morning").hasAttribute("data-done")).toBe(false);
});

it("shows a failed save inline", async () => {
	const user = userEvent.setup();
	setup({
		onSave: vi.fn(async () => {
			throw new Error("Disk full");
		}),
	});
	await user.click(slot("Morning"));
	const energy = screen.getByRole("radiogroup", { name: "Morning energy" });
	await user.click(energy.querySelector('[aria-label^="2"]') as Element);
	await user.click(
		screen.getByRole("button", { name: "Save morning check-in" }),
	);
	expect((await screen.findByRole("alert")).textContent).toBe("Disk full");
});
