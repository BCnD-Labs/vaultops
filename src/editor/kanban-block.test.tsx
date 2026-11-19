// @vitest-environment happy-dom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { defaultColumns } from "../core/kanban";
import { NoteEditor } from "./NoteEditor";

afterEach(cleanup);
it("adds a card and moves it to the next column with the keyboard", async () => {
	render(
		<TooltipProvider>
			<NoteEditor
				doc={{
					type: "doc",
					content: [
						{
							type: "kanban",
							attrs: { id: "board", columns: defaultColumns() },
						},
					],
				}}
				noteId="board-note"
				onChange={() => {}}
			/>
		</TooltipProvider>,
	);
	const [add] = await screen.findAllByRole("button", { name: "Add card" });
	if (!add) throw new Error("Missing Add card");
	fireEvent.click(add);
	const handle = await screen.findByRole("button", { name: "Move card" });
	fireEvent.keyDown(handle, { key: "ArrowRight", altKey: true });
	const doing = screen.getByDisplayValue("Doing").closest("section");
	if (!doing) throw new Error("Missing column");
	await waitFor(() =>
		expect(within(doing).getByLabelText("Card text")).toBeTruthy(),
	);
});
