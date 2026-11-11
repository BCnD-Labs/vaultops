// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReflectionDraft } from "../../core/planner/reflection";
import { ReflectionSection } from "./ReflectionSection";

afterEach(cleanup);

const setup = (stored: ReflectionDraft, reflectedAt?: string) => {
	const save = vi.fn(async () => {});
	render(
		<ReflectionSection
			reflectedAt={reflectedAt}
			writable
			load={async () => stored}
			save={save}
		/>,
	);
	return save;
};

describe("ReflectionSection", () => {
	it("is a plain button, not a form, until pressed", () => {
		setup({ items: {}, notes: "" });
		expect(screen.getByRole("button", { name: "Reflect" })).toBeTruthy();
		expect(screen.queryByRole("dialog")).toBeNull();
		expect(screen.queryByLabelText("Notes")).toBeNull();
	});

	it("saves only the items the user added", async () => {
		const user = userEvent.setup();
		const save = setup({ items: {}, notes: "" });
		await user.click(screen.getByRole("button", { name: "Reflect" }));
		const saveBtn = await screen.findByRole("button", {
			name: "Save reflection",
		});
		expect((saveBtn as HTMLButtonElement).disabled).toBe(true);
		await user.click(screen.getByRole("button", { name: "Difficulty" }));
		await user.click(screen.getByRole("radio", { name: "Hard" }));
		await user.click(screen.getByRole("button", { name: "Save reflection" }));
		await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
		expect(save).toHaveBeenCalledWith({
			items: { difficulty: "Hard" },
			notes: "",
		});
	});

	it("keeps Save off when nothing changed", async () => {
		const user = userEvent.setup();
		setup(
			{ items: { outcome: "As expected" }, notes: "n" },
			"2026-11-09T10:00:00.000Z",
		);
		await user.click(screen.getByRole("button", { name: "Edit reflection" }));
		const saveBtn = await screen.findByRole("button", {
			name: "Save reflection",
		});
		expect((saveBtn as HTMLButtonElement).disabled).toBe(true);
		await user.click(screen.getByRole("button", { name: "Remove Outcome" }));
		expect((saveBtn as HTMLButtonElement).disabled).toBe(false);
	});
});
