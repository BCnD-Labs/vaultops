// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { OutlinePanel } from "./OutlinePanel";

afterEach(() => {
	cleanup();
	document.body.innerHTML = "";
});

it("lists the headings and scrolls the editor to the one clicked", async () => {
	const scroll = vi.fn();
	const editor = document.createElement("div");
	editor.className = "note-editor";
	const heading = document.createElement("h2");
	heading.setAttribute("data-id", "b");
	heading.scrollIntoView = scroll;
	editor.append(heading);
	document.body.append(editor);

	render(
		<OutlinePanel
			items={[
				{ id: "a", level: 1, text: "Intro" },
				{ id: "b", level: 2, text: "Details" },
			]}
		/>,
		{ container: document.body.appendChild(document.createElement("div")) },
	);
	const user = userEvent.setup();
	expect(
		screen.getAllByRole("button").map((button) => button.textContent),
	).toEqual(["Intro", "Details"]);
	await user.click(screen.getByRole("button", { name: "Details" }));
	expect(scroll).toHaveBeenCalledTimes(1);
});

it("disables a heading that has no id yet, and says so when there are none", () => {
	const { rerender } = render(
		<OutlinePanel items={[{ id: null, level: 1, text: "New" }]} />,
	);
	expect(
		(screen.getByRole("button", { name: "New" }) as HTMLButtonElement).disabled,
	).toBe(true);
	rerender(<OutlinePanel items={[]} />);
	expect(screen.getByText(/No headings yet/)).toBeTruthy();
});
