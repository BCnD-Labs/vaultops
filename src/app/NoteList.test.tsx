// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { NoteList } from "./NoteList";

const props = {
	notes: [
		{
			path: "root.vnote",
			title: "Root note",
			preview: "Preview",
			tags: [],
			readOnly: false,
		},
		{
			path: "Work/n.vnote",
			title: "Work note",
			preview: "Body",
			tags: ["tag"],
			readOnly: true,
		},
	],
	vault: "Vault",
	livePath: "Work/n.vnote",
	locked: false,
	searching: false,
	onOpen: vi.fn(),
};
afterEach(() => {
	cleanup();
	localStorage.clear();
	vi.unstubAllGlobals();
	vi.clearAllMocks();
});
it("renders bracketed filters, expanded folder headers, counts and rows", () => {
	const html = renderToStaticMarkup(<NoteList {...props} />);
	for (const text of [
		"[All]",
		'aria-pressed="true"',
		"Vault root",
		"Work",
		'aria-expanded="true"',
		"note-section-count",
		"Root note",
		"Body",
		"#tag",
		'aria-current="true"',
	])
		expect(html).toContain(text);
});
it("filters, opens notes, and restores collapsed sections after remounting", () => {
	const rendered = render(<NoteList {...props} />);
	fireEvent.click(screen.getByRole("button", { name: "Tagged" }));
	expect(screen.queryByText("Root note")).toBeNull();
	fireEvent.click(screen.getByRole("button", { name: /Work note/ }));
	expect(props.onOpen).toHaveBeenCalledWith("Work/n.vnote");
	fireEvent.click(screen.getByRole("button", { name: "Work 1" }));
	expect(screen.queryByText("Work note")).toBeNull();
	rendered.unmount();
	render(<NoteList {...props} />);
	expect(screen.getByText("Root note")).toBeTruthy();
	expect(screen.queryByText("Work note")).toBeNull();
	fireEvent.click(screen.getByRole("button", { name: "Work 1" }));
	fireEvent.click(screen.getByRole("button", { name: "Untagged" }));
	expect(screen.queryByText("Work note")).toBeNull();
	expect(screen.getByText("Root note")).toBeTruthy();
});
it("shows a filter empty state and keeps collapse working when storage fails", () => {
	vi.stubGlobal("localStorage", {
		getItem: () => {
			throw Error("blocked");
		},
		setItem: () => {
			throw Error("full");
		},
		clear: () => {},
	});
	render(<NoteList {...props} notes={props.notes.slice(0, 1)} />);
	fireEvent.click(screen.getByRole("button", { name: "Vault root 1" }));
	expect(screen.queryByText("Root note")).toBeNull();
	fireEvent.click(screen.getByRole("button", { name: "Vault root 1" }));
	expect(screen.getByText("Root note")).toBeTruthy();
	fireEvent.click(screen.getByRole("button", { name: "Tagged" }));
	expect(screen.getByText("No notes match.")).toBeTruthy();
});
