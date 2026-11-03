// @vitest-environment happy-dom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import type { Props } from "../core/notes/properties";
import { NoteTools } from "./NoteTools";

const properties: Props = { Summary: { type: "text", value: "hello" } };
const callbacks = { onChange: () => {}, onOpenTag: () => {} };
afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	localStorage.clear();
});

it.each([true, false])("renders both tabs with hasNote=%s", (hasNote) => {
	for (const tab of ["properties", "changes"]) {
		localStorage.setItem("vaultops:note-tools-tab", tab);
		const html = renderToStaticMarkup(
			<NoteTools
				hasNote={hasNote}
				props={properties}
				editable
				{...callbacks}
			/>,
		);
		expect(html).toContain("Properties");
		expect(html).toContain("Changes");
		if (tab === "changes") {
			expect(html).toContain("Commit, history and sync arrive soon.");
			expect(html).toContain("No changes to show yet.");
			expect(html).not.toContain("Summary");
		} else {
			expect(html).toContain(
				hasNote ? "Summary" : "Open a note to see its properties.",
			);
		}
	}
});

it("remembers the chosen tab across remounts and tolerates unavailable storage", async () => {
	const user = userEvent.setup();
	const tools = (
		<NoteTools hasNote={false} props={null} editable={false} {...callbacks} />
	);
	const first = render(tools);
	await user.click(screen.getByRole("tab", { name: "Changes" }));
	first.unmount();
	render(tools);
	expect(
		screen.getByRole("tab", { name: "Changes" }).getAttribute("aria-selected"),
	).toBe("true");
	cleanup();
	vi.stubGlobal("localStorage", {
		getItem: () => {
			throw new Error("denied");
		},
		setItem: () => {
			throw new Error("denied");
		},
	});
	render(tools);
	expect(screen.getByText("Open a note to see its properties.")).toBeTruthy();
	await user.click(screen.getByRole("tab", { name: "Changes" }));
	expect(screen.getByText("No changes to show yet.")).toBeTruthy();
});

function Editable() {
	const [props, setProps] = useState(properties);
	return (
		<NoteTools
			hasNote
			props={props}
			editable
			onChange={setProps}
			onOpenTag={() => {}}
		/>
	);
}

it("edits properties and tags and creates a typed property from the popover", async () => {
	const user = userEvent.setup();
	render(<Editable />);
	await user.type(screen.getByRole("textbox", { name: "Summary" }), "!");
	expect(
		(screen.getByRole("textbox", { name: "Summary" }) as HTMLInputElement)
			.value,
	).toBe("hello!");
	await user.type(
		screen.getByRole("textbox", { name: "Add to tags" }),
		"idea{Enter}",
	);
	await user.click(
		screen.getByRole("button", { name: "Remove idea from tags" }),
	);
	expect(screen.queryByText("idea")).toBeNull();
	await user.click(screen.getByRole("button", { name: "Add property" }));
	await user.type(
		screen.getByRole("textbox", { name: "New property name" }),
		"Pages",
	);
	await user.click(screen.getByRole("combobox", { name: "New property type" }));
	await user.click(screen.getByRole("option", { name: "Number" }));
	await user.click(
		within(screen.getByRole("dialog")).getByRole("button", {
			name: "Add property",
		}),
	);
	expect(screen.getByRole("spinbutton", { name: "Pages" })).toBeTruthy();
});
