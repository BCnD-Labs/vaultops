// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlannerTask } from "../../core/planner/rules";
import { fmtDay } from "./fmt";
import { NewItemDialog } from "./NewItemDialog";

afterEach(cleanup);

function setup(
	over: {
		defaults?: { date: string; time?: string; today?: string };
		task?: PlannerTask;
		onCreate?: (item: unknown) => Promise<void>;
		onSave?: (patch: unknown) => Promise<void>;
		open?: boolean;
	} = {},
) {
	const onClose = vi.fn();
	const onCreate = vi.fn(over.onCreate ?? (async () => {}));
	const onSave = vi.fn(over.onSave ?? (async () => {}));
	render(
		<NewItemDialog
			open={over.open ?? true}
			defaults={over.defaults ?? { date: "2026-11-09", today: "2026-11-09" }}
			task={over.task}
			onClose={onClose}
			onCreate={onCreate}
			onSave={onSave}
		/>,
	);
	return { onClose, onCreate, onSave };
}
const create = () =>
	screen.getByRole("button", { name: /^(Create|Save)/ }) as HTMLButtonElement;

describe("NewItemDialog", () => {
	it("renders nothing when closed", () => {
		setup({ open: false });
		expect(screen.queryByRole("dialog")).toBeNull();
	});

	it("keeps Create disabled until there is a description", async () => {
		setup();
		expect(create().disabled).toBe(true);
		await userEvent.type(screen.getByLabelText("Description"), "  ");
		expect(create().disabled).toBe(true);
		await userEvent.type(screen.getByLabelText("Description"), "Buy milk");
		expect(create().disabled).toBe(false);
	});

	it("creates a task with the default due date, trimmed description and no duration", async () => {
		const { onCreate, onClose } = setup();
		await userEvent.type(screen.getByLabelText("Description"), "  Buy milk ");
		await userEvent.click(create());
		expect(onCreate).toHaveBeenCalledWith({
			title: "Buy milk",
			kind: "task",
			due: "2026-11-09",
			time: undefined,
			durationMinutes: undefined,
		});
		await waitFor(() => expect(onClose).toHaveBeenCalled());
	});

	it("parses typed natural-language dates, shows previews beside each field, and rejects invalid dates", async () => {
		const { onCreate } = setup({
			defaults: { date: "", today: "2026-11-09" },
		});
		await userEvent.type(screen.getByLabelText("Description"), "Call dentist");
		await userEvent.click(screen.getByRole("radio", { name: "High" }));
		const dueField = screen.getByLabelText("Due date");
		await userEvent.type(dueField, "someday");
		expect(screen.getByTestId("due-preview").textContent).toBe("Invalid date");
		expect(create().disabled).toBe(true);
		await userEvent.clear(dueField);
		await userEvent.type(dueField, "fri");
		expect(screen.getByTestId("due-preview").textContent).toBe(
			`${fmtDay("2026-11-13")} · 2026-11-13`,
		);
		await userEvent.type(screen.getByLabelText("Scheduled"), "tomorrow");
		expect(screen.getByTestId("scheduled-preview").textContent).toBe(
			`${fmtDay("2026-11-10")} · 2026-11-10`,
		);
		await userEvent.selectOptions(
			screen.getByLabelText("Recurrence"),
			"weekly",
		);
		await userEvent.click(create());
		expect(onCreate).toHaveBeenCalledWith({
			title: "Call dentist",
			kind: "task",
			due: "2026-11-13",
			time: undefined,
			durationMinutes: undefined,
			scheduledDate: "2026-11-10",
			priority: "high",
			recurrence: "weekly",
		});
	});

	it("allows a task with no date and disables the time field", async () => {
		const { onCreate } = setup({ defaults: { date: "" } });
		expect(
			(screen.getByLabelText("Due time") as HTMLInputElement).disabled,
		).toBe(true);
		await userEvent.type(screen.getByLabelText("Description"), "Someday");
		await userEvent.click(create());
		expect(onCreate).toHaveBeenCalledWith(
			expect.objectContaining({ kind: "task", due: undefined }),
		);
	});

	it("an event gets a one hour duration when it has a start time", async () => {
		const { onCreate } = setup({
			defaults: { date: "2026-11-09", time: "14:30" },
		});
		await userEvent.click(screen.getByRole("tab", { name: "Event" }));
		expect(screen.getByLabelText("Start time")).toBeTruthy();
		await userEvent.type(screen.getByLabelText("Description"), "Lecture");
		await userEvent.click(create());
		expect(onCreate).toHaveBeenCalledWith({
			title: "Lecture",
			kind: "event",
			due: "2026-11-09",
			time: "14:30",
			durationMinutes: 60,
		});
	});

	it("an event without a start time has no duration", async () => {
		const { onCreate } = setup();
		await userEvent.click(screen.getByRole("tab", { name: "Event" }));
		await userEvent.type(screen.getByLabelText("Description"), "All day");
		await userEvent.click(create());
		expect(onCreate).toHaveBeenCalledWith(
			expect.objectContaining({ kind: "event", durationMinutes: undefined }),
		);
	});

	it("an event needs a date", async () => {
		setup({ defaults: { date: "" } });
		await userEvent.click(screen.getByRole("tab", { name: "Event" }));
		await userEvent.type(screen.getByLabelText("Description"), "Lecture");
		expect(create().disabled).toBe(true);
	});

	it("the heading and button follow the kind", async () => {
		setup();
		expect(screen.getByText("New task")).toBeTruthy();
		await userEvent.click(screen.getByRole("tab", { name: "Event" }));
		expect(screen.getByText("New event")).toBeTruthy();
		expect(create().textContent).toBe("Create event");
	});

	it("edits an existing task and saves patched fields", async () => {
		const existing: PlannerTask = {
			path: "Planner/t1.vnote",
			number: 1,
			title: "Draft report",
			status: "open",
			kind: "task",
			priority: "medium",
			due: "2026-11-09",
			starred: false,
			labels: [],
			preview: "",
		};
		const { onSave, onClose } = setup({ task: existing });
		expect(screen.getByText("Edit task")).toBeTruthy();
		const desc = screen.getByLabelText("Description") as HTMLInputElement;
		expect(desc.value).toBe("Draft report");
		await userEvent.clear(desc);
		await userEvent.type(desc, "Send final report");
		await userEvent.click(screen.getByRole("radio", { name: "High" }));
		await userEvent.click(create());
		expect(onSave).toHaveBeenCalledWith(
			expect.objectContaining({
				title: "Send final report",
				priority: "high",
				due: "2026-11-09",
			}),
		);
		await waitFor(() => expect(onClose).toHaveBeenCalled());
	});

	it("shows the error, stays open and keeps the description when creating fails", async () => {
		const { onClose } = setup({
			onCreate: async () => {
				throw new Error("The change failed the save check");
			},
		});
		const title = screen.getByLabelText("Description") as HTMLInputElement;
		await userEvent.type(title, "Keep me");
		await userEvent.click(create());
		expect((await screen.findByRole("alert")).textContent).toMatch(
			/save check/,
		);
		expect(onClose).not.toHaveBeenCalled();
		expect(title.value).toBe("Keep me");
		expect(create().disabled).toBe(false);
	});

	it("Cancel closes without creating", async () => {
		const { onClose, onCreate } = setup();
		await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
		expect(onClose).toHaveBeenCalled();
		expect(onCreate).not.toHaveBeenCalled();
	});

	it("does not submit twice while the first create is still running", async () => {
		let release: () => void = () => {};
		const { onCreate } = setup({
			onCreate: () => new Promise<void>((r) => (release = r)),
		});
		await userEvent.type(screen.getByLabelText("Description"), "Once{Enter}");
		await userEvent.keyboard("{Enter}");
		expect(onCreate).toHaveBeenCalledTimes(1);
		release();
	});
});
