// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { MemoryHost } from "../../host/memory-host";
import type { NoteRow } from "../session";
import { createTask } from "./actions";
import { PlannerProvider, usePlanner } from "./PlannerContext";
import { TaskInspector } from "./TaskInspector";

const notify = vi.hoisted(() => vi.fn());
vi.mock("../../ui/notify", () => ({ notify }));

afterEach(() => {
	cleanup();
	notify.mockReset();
});

function Probe() {
	const p = usePlanner();
	const task = p.tasks[0];
	return (
		<>
			{task && (
				<button
					type="button"
					onClick={() => void p.toggleFromList({ ...task, status: "open" })}
				>
					close
				</button>
			)}
			<TaskInspector
				task={p.selected}
				writable
				onPatch={p.patch}
				onOpen={() => {}}
				onLoadReflection={p.loadReflection}
				onSaveReflection={p.saveReflection}
				openReflection={p.reflectPath === p.selected?.path}
				onReflectionOpened={p.reflectStarted}
			/>
		</>
	);
}

async function setup() {
	const host = new MemoryHost();
	const path = await createTask(host, {
		title: "Write it up",
		number: 1,
		now: new Date("2026-11-07T10:00:00Z"),
	});
	const task = {
		path,
		number: 1,
		title: "Write it up",
		status: "closed" as const,
		kind: "task" as const,
		starred: false,
		labels: [],
		preview: "",
	};
	const rows: NoteRow[] = [
		{ path, title: task.title, preview: "", readOnly: false, tags: [], task },
	];
	render(
		<PlannerProvider
			notes={rows}
			host={host}
			writable
			onChanged={async () => {}}
			onOpenNote={() => {}}
			onOpenScreen={() => {}}
		>
			<Probe />
		</PlannerProvider>,
	);
}

it("offers Reflect after a task is closed, and the offer opens the editor", async () => {
	await setup();
	await userEvent.click(screen.getByRole("button", { name: "close" }));
	expect(notify).toHaveBeenCalledTimes(1);
	expect(notify.mock.calls[0]?.[0]).toBe("Task closed");
	const action = notify.mock.calls[0]?.[1].action;
	expect(action.label).toBe("Reflect");
	expect(screen.queryByRole("region", { name: "Reflection" })).toBeNull();
	await import("@testing-library/react").then(({ act }) =>
		act(async () => {
			action.onClick();
		}),
	);
	expect(
		await screen.findByRole("region", { name: "Reflection" }),
	).toBeTruthy();
});
