// @vitest-environment happy-dom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { buildTree } from "../core/notes/tree";
import { Sidebar } from "./Sidebar";
import type { VaultView } from "./session";
import type { Selection } from "./sidebar-selection";

const row = (path: string, title: string, tags: string[], kind?: "canvas") => ({
	path,
	title,
	preview: "",
	tags,
	readOnly: false,
	kind,
});
const view: VaultView = {
	name: "Test vault",
	status: "opened",
	writable: true,
	messages: [],
	report: [],
	folders: ["Class", "Empty"],
	notes: [
		row("Root.vnote", "Root note", []),
		row("Class/A.vnote", "Class note", ["Work"]),
		row("Class/Board.vnote", "Class board", [], "canvas"),
	],
};

afterEach(() => {
	cleanup();
	localStorage.clear();
});

function Harness({
	start = { kind: "all" },
	onOpen = () => {},
	onStartNote = () => {},
	onSelected = () => {},
}: {
	start?: Selection;
	onOpen?: (path: string) => void;
	onStartNote?: (folder: string) => void;
	onSelected?: (selection: Selection) => void;
}) {
	const [selection, setSelection] = useState<Selection>(start);
	return (
		<TooltipProvider>
			<Sidebar
				view={view}
				busy={false}
				maintainer={false}
				selection={selection}
				livePath={null}
				tree={buildTree(view.folders, view.notes)}
				treeActions={{
					createFolder() {},
					renameFolder() {},
					deleteFolder() {},
					move() {},
				}}
				treeNotice={null}
				onStartNote={onStartNote}
				onStartCanvas={() => {}}
				onChooseVault={() => {}}
				onShowMaintainer={() => {}}
				onNavigate={() => {}}
				onSelection={(next) => {
					onSelected(next);
					setSelection(next);
				}}
				onOpen={onOpen}
			/>
		</TooltipProvider>
	);
}

it("shows a plain folder tree by default, with notes at the root and canvases marked", () => {
	render(<Harness />);
	expect(
		screen.getByRole("region", { name: "Folders and notes" }),
	).toBeTruthy();
	expect(screen.queryByRole("region", { name: "Notes list" })).toBeNull();
	expect(screen.getByText("Root note")).toBeTruthy();
	expect(screen.getByRole("button", { name: /^Class/ })).toBeTruthy();
	// Folders start closed, so notes inside are hidden until the folder opens.
	expect(screen.queryByText("Class note")).toBeNull();
});

it("clicking a folder opens it and selects it; New note then creates inside it", async () => {
	const user = userEvent.setup();
	const selected = vi.fn();
	const created = vi.fn();
	render(<Harness onSelected={selected} onStartNote={created} />);
	const folder = screen.getByRole("button", {
		name: /^Class/,
		expanded: false,
	});
	await user.click(folder);
	expect(selected).toHaveBeenCalledWith({ kind: "folder", value: "Class" });
	expect(screen.getByText("Class note")).toBeTruthy();
	const board = screen.getByText("Class board").closest("button");
	expect(board?.querySelector(".lucide-layout-dashboard")).not.toBeNull();
	expect(
		screen
			.getByText("Class note")
			.closest("button")
			?.querySelector(".lucide-file-text"),
	).not.toBeNull();
	await user.click(screen.getByRole("button", { name: "New note" }));
	expect(created).toHaveBeenCalledWith("Class");
	await user.click(
		screen.getByRole("button", { name: /^Class/, expanded: true }),
	);
	expect(screen.queryByText("Class note")).toBeNull();
});

it("opens a note from the tree", async () => {
	const user = userEvent.setup();
	const open = vi.fn();
	render(<Harness onOpen={open} />);
	await user.click(screen.getByText("Root note"));
	expect(open).toHaveBeenCalledWith("Root.vnote");
});

it("filters the tree by a picked tag and clears it from the chip", async () => {
	const user = userEvent.setup();
	render(<Harness />);
	await user.click(screen.getByRole("button", { name: /#Work/ }));
	// Matching notes are shown inside their (now open) folder; others are hidden.
	expect(screen.getByText("Class note")).toBeTruthy();
	expect(screen.queryByText("Root note")).toBeNull();
	expect(screen.queryByText("Class board")).toBeNull();
	expect(screen.queryByText("Empty")).toBeNull();
	await user.click(
		screen.getByRole("button", { name: "Clear tag filter #Work" }),
	);
	expect(screen.getByText("Root note")).toBeTruthy();
	expect(
		screen.queryByRole("button", { name: /^Clear tag filter/ }),
	).toBeNull();
});

it("switches to the notebook navigator layout and back, and remembers the choice", async () => {
	const user = userEvent.setup();
	const { unmount } = render(<Harness />);
	await user.click(
		screen.getByRole("button", { name: "Notebook navigator view" }),
	);
	expect(screen.getByRole("region", { name: "Notes list" })).toBeTruthy();
	expect(localStorage.getItem("vaultops:sidebar-mode")).toBe("navigator");
	unmount();
	render(<Harness />);
	const list = screen.getByRole("region", { name: "Notes list" });
	expect(within(list).getByText("Root note")).toBeTruthy();
	await user.click(screen.getByRole("button", { name: "Folder tree view" }));
	expect(screen.queryByRole("region", { name: "Notes list" })).toBeNull();
	expect(localStorage.getItem("vaultops:sidebar-mode")).toBe("tree");
});
