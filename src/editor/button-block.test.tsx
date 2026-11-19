// @vitest-environment happy-dom

import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { NoteEditor } from "./NoteEditor";

afterEach(cleanup);

function open(action: string, editable = true) {
	const run = vi.fn();
	render(
		<TooltipProvider>
			<NoteEditor
				doc={{
					type: "doc",
					content: [
						{
							type: "buttonBlock",
							attrs: { label: "Go", action, target: "test" },
						},
					],
				}}
				onChange={() => {}}
				editable={editable}
				onRunButton={run}
				buttonOptions={{
					commands: [{ id: "test", label: "Test", available: true }],
					canCreate: false,
				}}
			/>
		</TooltipProvider>,
	);
	return run;
}

it("only dispatches the saved action when clicked", async () => {
	const run = open("command");
	const button = await screen.findByRole("button", { name: "Go" });
	expect(run).not.toHaveBeenCalled();
	await act(async () => fireEvent.click(button));
	expect(run).toHaveBeenCalledWith(
		{ action: "command", target: "test" },
		expect.anything(),
	);
});

it("disables template insertion in a read-only editor", async () => {
	const run = open("insert-template", false);
	const button = await screen.findByRole("button", { name: "Go" });
	expect(button).toHaveProperty("disabled", true);
	expect(button.parentElement?.title).toContain("Switch to editing view");
	expect(run).not.toHaveBeenCalled();
});
