// @vitest-environment happy-dom
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { SendToDialog } from "./SendToDialog";

it("shows suggestions first, filters destinations, and closes on Escape without sending", () => {
	const source = {
		title: "Inbox",
		path: "inbox",
		preview: "",
		tags: [],
		readOnly: false,
	};
	const note = (title: string) => ({ ...source, title, path: title });
	const close = vi.fn();
	const send = vi.fn();
	render(
		<SendToDialog
			block={{ id: "b", type: "paragraph", parent: null }}
			source={source}
			notes={[source, note("Archive"), note("Recent")]}
			recent={["Recent"]}
			today="2026-11-18"
			headings={async () => []}
			close={close}
			send={send}
		/>,
	);
	const rows = () =>
		screen.getAllByRole("option").map((row) => row.textContent);
	expect(rows()).toEqual([
		"Recent",
		"Archive",
		"Today's journal",
		"New note",
		"New note and leave a link",
		"New planner task",
	]);
	fireEvent.change(screen.getByRole("combobox"), { target: { value: "arch" } });
	expect(rows()).toEqual(["Archive"]);
	fireEvent.keyDown(screen.getByRole("combobox"), { key: "Escape" });
	expect(close).toHaveBeenCalledOnce();
	expect(send).not.toHaveBeenCalled();
});
