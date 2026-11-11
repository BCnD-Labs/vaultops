// @vitest-environment happy-dom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { buildTree } from "../core/notes/tree";
import { DRAG_TYPE, NoteTree, type TreeActions } from "./NoteTree";

afterEach(cleanup);

const nodes = () =>
	buildTree(
		["Class", "Class/Week 1", "Empty", "Solo"],
		[
			{ path: "Home.vnote", title: "Home", readOnly: false },
			{ path: "Board.vnote", title: "Board", readOnly: false, kind: "canvas" },
			{ path: "Class/A.vnote", title: "Note A", readOnly: false },
			{ path: "Class/B.vnote", title: "Note B", readOnly: true },
			{ path: "Class/Week 1/C.vnote", title: "Note C", readOnly: false },
			{ path: "Solo/One.vnote", title: "Only one", readOnly: false },
		],
	);

function actions(): TreeActions {
	return {
		createFolder: vi.fn(),
		renameFolder: vi.fn(),
		deleteFolder: vi.fn(),
		deleteNote: vi.fn(),
		move: vi.fn(),
	};
}

function setup(
	over: Partial<React.ComponentProps<typeof NoteTree>> = {},
	a: TreeActions = actions(),
) {
	const onOpen = vi.fn();
	const view = render(
		<TooltipProvider>
			<NoteTree
				nodes={nodes()}
				livePath={null}
				onOpen={onOpen}
				actions={a}
				busy={false}
				{...over}
			/>
		</TooltipProvider>,
	);
	return { a, onOpen, view };
}
const folder = (name: string) =>
	screen.getByRole("button", { name: new RegExp(`^${name}`) });

/** Right-click a row and choose an item from its menu. */
async function choose(row: string, item: string) {
	fireEvent.contextMenu(folder(row));
	await userEvent.click(screen.getByRole("menuitem", { name: item }));
}

function transfer(payload?: unknown) {
	const data: Record<string, string> = {};
	if (payload !== undefined) data[DRAG_TYPE] = JSON.stringify(payload);
	return {
		types: Object.keys(data),
		setData: (t: string, v: string) => {
			data[t] = v;
		},
		getData: (t: string) => data[t] ?? "",
		dropEffect: "",
		effectAllowed: "",
	};
}

/** happy-dom drops `dataTransfer` and `relatedTarget` from event inits, so set them on a plain event. */
function drag(
	target: Element,
	type: "dragstart" | "dragover" | "drop" | "dragleave",
	dataTransfer: ReturnType<typeof transfer>,
	relatedTarget: Element | null = null,
) {
	const event = new Event(type, { bubbles: true, cancelable: true });
	Object.assign(event, { dataTransfer, relatedTarget });
	fireEvent(target, event);
}

describe("opening and showing", () => {
	it("starts closed, opens a folder on click and closes it again", async () => {
		setup();
		expect(screen.queryByText("Note A")).toBeNull();
		await userEvent.click(folder("Class"));
		expect(screen.getByText("Note A")).toBeTruthy();
		await userEvent.click(folder("Class"));
		expect(screen.queryByText("Note A")).toBeNull();
	});

	it("opens the folders around the live note and reveals them when it changes", () => {
		const { view, a } = setup({ livePath: "Class/Week 1/C.vnote" });
		expect(screen.getByText("Note C")).toBeTruthy();
		view.rerender(
			<TooltipProvider>
				<NoteTree
					nodes={nodes()}
					livePath="Solo/One.vnote"
					onOpen={() => {}}
					actions={a}
					busy={false}
				/>
			</TooltipProvider>,
		);
		expect(screen.getByText("Only one")).toBeTruthy();
		expect(screen.getByText("Note C")).toBeTruthy();
	});

	it("marks the live note as current and opens a note on click", async () => {
		const { onOpen } = setup({ livePath: "Home.vnote" });
		const home = screen.getByText("Home").closest("button") as HTMLElement;
		expect(home.getAttribute("aria-current")).toBe("true");
		await userEvent.click(screen.getByText("Board"));
		expect(onOpen).toHaveBeenCalledWith("Board.vnote");
	});

	it("shows counts, a read-only tag, 'Empty' for an empty folder, and a canvas icon", async () => {
		setup();
		expect(folder("Class").textContent).toContain("3");
		expect(folder("Solo").textContent).toContain("1");
		expect(folder("Empty").textContent).not.toMatch(/\d/);
		await userEvent.click(folder("Class"));
		expect(screen.getByText("read-only")).toBeTruthy();
		await userEvent.click(folder("Empty"));
		expect(screen.getByText("Empty", { selector: "p" })).toBeTruthy();
		expect(
			screen
				.getByText("Board")
				.closest("button")
				?.querySelector(".lucide-layout-dashboard"),
		).not.toBeNull();
		fireEvent.contextMenu(folder("Board"));
		expect(
			screen.getByRole("menuitem", { name: "Move to trash" }),
		).toBeTruthy();
	});

	it("foldersOnly hides notes", async () => {
		setup({ foldersOnly: true });
		expect(screen.queryByText("Home")).toBeNull();
		await userEvent.click(folder("Class"));
		expect(screen.queryByText("Note A")).toBeNull();
		expect(screen.getByText("Week 1")).toBeTruthy();
	});

	it("expandAll shows every folder open", () => {
		setup({ expandAll: true });
		expect(screen.getByText("Note A")).toBeTruthy();
		expect(screen.getByText("Note C")).toBeTruthy();
	});

	it("with a folder selector, selecting and toggling are separate", async () => {
		const onSelectFolder = vi.fn();
		setup({ onSelectFolder, selectedFolder: "Class" });
		expect(folder("Class").getAttribute("aria-current")).toBe("true");
		await userEvent.click(folder("Class"));
		expect(onSelectFolder).toHaveBeenCalledWith("Class");
		expect(screen.queryByText("Note A")).toBeNull();
		await userEvent.click(
			screen.getByRole("button", { name: "Toggle folder Class" }),
		);
		expect(screen.getByText("Note A")).toBeTruthy();
	});

	it("toggleOnSelect makes a click select and open", async () => {
		const onSelectFolder = vi.fn();
		setup({ onSelectFolder, toggleOnSelect: true });
		await userEvent.click(folder("Class"));
		expect(onSelectFolder).toHaveBeenCalledWith("Class");
		expect(screen.getByText("Note A")).toBeTruthy();
	});
});

describe("creating and renaming folders", () => {
	it("New folder at the root asks for a name, then creates it", async () => {
		const { a } = setup();
		await userEvent.click(screen.getByRole("button", { name: "New folder" }));
		await userEvent.type(
			screen.getByLabelText("New folder name"),
			"Reading{Enter}",
		);
		expect(a.createFolder).toHaveBeenCalledWith("", "Reading");
		expect(screen.queryByLabelText("New folder name")).toBeNull();
	});

	it("an empty new-folder name still goes through, for the app to name it", async () => {
		const { a } = setup();
		await userEvent.click(screen.getByRole("button", { name: "New folder" }));
		await userEvent.type(screen.getByLabelText("New folder name"), "{Enter}");
		expect(a.createFolder).toHaveBeenCalledWith("", "");
	});

	it("Escape cancels, and leaving the field with nothing typed cancels too", async () => {
		const { a } = setup();
		await userEvent.click(screen.getByRole("button", { name: "New folder" }));
		await userEvent.type(screen.getByLabelText("New folder name"), "x{Escape}");
		expect(a.createFolder).not.toHaveBeenCalled();
		await userEvent.click(screen.getByRole("button", { name: "New folder" }));
		fireEvent.blur(screen.getByLabelText("New folder name"));
		expect(a.createFolder).not.toHaveBeenCalled();
		expect(screen.queryByLabelText("New folder name")).toBeNull();
	});

	it("leaving the field with a name keeps it", async () => {
		const { a } = setup();
		await userEvent.click(screen.getByRole("button", { name: "New folder" }));
		const input = screen.getByLabelText("New folder name") as HTMLInputElement;
		await userEvent.type(input, "Kept");
		fireEvent.blur(input);
		expect(a.createFolder).toHaveBeenCalledWith("", "Kept");
		expect(a.createFolder).toHaveBeenCalledTimes(1);
	});

	it("a folder's own button creates inside it and opens it", async () => {
		const { a } = setup();
		await choose("Class", "New folder here");
		expect(screen.getByText("Note A")).toBeTruthy();
		await userEvent.type(
			screen.getByLabelText("New folder name"),
			"Sub{Enter}",
		);
		expect(a.createFolder).toHaveBeenCalledWith("Class", "Sub");
	});

	it("an Empty folder shows the new-name field instead of 'Empty' while creating", async () => {
		setup();
		await userEvent.click(folder("Empty"));
		await choose("Empty", "New folder here");
		expect(screen.getByLabelText("New folder name")).toBeTruthy();
		expect(screen.queryByText("Empty", { selector: "p" })).toBeNull();
	});

	it("a new-folder request from outside starts the field once, not on every render", async () => {
		const a = actions();
		const { view } = setup({ newFolderRequest: 0 }, a);
		const again = (n: number) =>
			view.rerender(
				<TooltipProvider>
					<NoteTree
						nodes={nodes()}
						livePath={null}
						onOpen={() => {}}
						actions={a}
						busy={false}
						newFolderRequest={n}
					/>
				</TooltipProvider>,
			);
		again(1);
		expect(screen.getByLabelText("New folder name")).toBeTruthy();
		await userEvent.type(screen.getByLabelText("New folder name"), "{Escape}");
		again(1);
		expect(screen.queryByLabelText("New folder name")).toBeNull();
	});

	it("renames with Enter, ignores an unchanged name, and Escape keeps the old one", async () => {
		const { a } = setup();
		await choose("Class", "Rename");
		const input = screen.getByLabelText(
			"Rename folder Class",
		) as HTMLInputElement;
		expect(input.value).toBe("Class");
		await userEvent.clear(input);
		await userEvent.type(input, "Courses{Enter}");
		expect(a.renameFolder).toHaveBeenCalledWith("Class", "Courses");

		await choose("Solo", "Rename");
		await userEvent.type(
			screen.getByLabelText("Rename folder Solo"),
			"{Enter}",
		);
		expect(a.renameFolder).toHaveBeenCalledTimes(1);

		await choose("Solo", "Rename");
		await userEvent.type(
			screen.getByLabelText("Rename folder Solo"),
			"zzz{Escape}",
		);
		expect(a.renameFolder).toHaveBeenCalledTimes(1);
	});

	it("a rename cannot be left empty", async () => {
		const { a } = setup();
		await choose("Solo", "Rename");
		const input = screen.getByLabelText(
			"Rename folder Solo",
		) as HTMLInputElement;
		await userEvent.clear(input);
		await userEvent.type(input, "{Enter}");
		expect(a.renameFolder).not.toHaveBeenCalled();
	});
});

describe("moving to the trash", () => {
	it("a note goes to the trash at once, with no question first", async () => {
		const { a } = setup();
		await choose("Home", "Move to trash");
		expect(screen.queryByRole("alert")).toBeNull();
		expect(a.deleteNote).toHaveBeenCalledWith("Home.vnote");
	});

	it("a folder says how many notes go with it", async () => {
		const { a } = setup();
		await choose("Class", "Move to trash");
		expect(screen.getByRole("alert").textContent).toContain("with its 3 notes");
		await userEvent.click(
			screen.getByRole("button", { name: "Move to trash" }),
		);
		expect(a.deleteFolder).toHaveBeenCalledWith("Class");
	});

	it("uses the singular for one note and says nothing for an empty folder", async () => {
		setup();
		await choose("Solo", "Move to trash");
		expect(screen.getByRole("alert").textContent).toContain("with its 1 note?");
		await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
		await choose("Empty", "Move to trash");
		expect(screen.getByRole("alert").textContent).not.toContain("with its");
	});

	it("a note's trash button does not disturb a folder confirmation", async () => {
		const { a } = setup();
		await choose("Solo", "Move to trash");
		await choose("Home", "Move to trash");
		expect(a.deleteNote).toHaveBeenCalledWith("Home.vnote");
		expect(screen.getAllByRole("alert")).toHaveLength(1);
		expect(screen.getByRole("alert").textContent).toContain("Solo");
	});
});

describe("drag and drop", () => {
	it("dragging a note or folder carries what it is", () => {
		setup();
		const t = transfer();
		drag(
			screen.getByText("Board").closest("button") as HTMLElement,
			"dragstart",
			t,
		);
		expect(JSON.parse(t.getData(DRAG_TYPE))).toEqual({
			kind: "note",
			path: "Board.vnote",
			readOnly: false,
		});
		const f = transfer();
		drag(folder("Class"), "dragstart", f);
		expect(JSON.parse(f.getData(DRAG_TYPE))).toEqual({
			kind: "folder",
			path: "Class",
			readOnly: false,
		});
		expect(f.effectAllowed).toBe("move");
	});

	it("carries the read-only flag of a note", async () => {
		setup();
		await userEvent.click(folder("Class"));
		const t = transfer();
		drag(
			screen.getByText("Note B").closest("button") as HTMLElement,
			"dragstart",
			t,
		);
		expect(JSON.parse(t.getData(DRAG_TYPE)).readOnly).toBe(true);
	});

	it("dropping on a folder moves into it and clears the highlight", () => {
		const { a } = setup();
		const item = { kind: "note", path: "Home.vnote", readOnly: false };
		const row = folder("Solo").closest(".tree-row") as HTMLElement;
		const t = transfer(item);
		drag(row, "dragover", t);
		expect(row.className).toContain("is-over");
		expect(t.dropEffect).toBe("move");
		drag(row, "drop", t);
		expect(a.move).toHaveBeenCalledWith(item, "Solo");
		expect(row.className).not.toContain("is-over");
	});

	it("dropping on empty space moves to the vault root", () => {
		const { a } = setup();
		const item = { kind: "folder", path: "Class/Week 1", readOnly: false };
		const root = document.querySelector(".tree") as HTMLElement;
		drag(root, "drop", transfer(item));
		expect(a.move).toHaveBeenCalledWith(item, "");
	});

	it("a drop on a folder does not also move it to the root", () => {
		const { a } = setup();
		const item = { kind: "note", path: "Home.vnote", readOnly: false };
		drag(
			folder("Solo").closest(".tree-row") as HTMLElement,
			"drop",
			transfer(item),
		);
		expect(a.move).toHaveBeenCalledTimes(1);
	});

	it("ignores drags that are not tree items, and damaged payloads", () => {
		const { a } = setup();
		const row = folder("Solo").closest(".tree-row") as HTMLElement;
		const foreign = { ...transfer(), types: ["text/plain"] };
		drag(row, "dragover", foreign);
		expect(row.className).not.toContain("is-over");
		const bad = transfer();
		bad.setData(DRAG_TYPE, "{not json");
		drag(row, "drop", bad);
		const wrongKind = transfer({ kind: "tab", path: "x" });
		drag(row, "drop", wrongKind);
		const noPath = transfer({ kind: "note" });
		drag(row, "drop", noPath);
		expect(a.move).not.toHaveBeenCalled();
	});

	it("leaving a row clears the highlight, and the next dragover brings it back", () => {
		setup();
		const row = folder("Solo").closest(".tree-row") as HTMLElement;
		const t = transfer({ kind: "note", path: "Home.vnote", readOnly: false });
		drag(row, "dragover", t);
		expect(row.className).toContain("is-over");
		// The leave also reaches the tree's own handler (it bubbles), so the row's
		// "still inside" check never decides alone; dragover repeats while hovering.
		drag(row, "dragleave", t, document.body);
		expect(row.className).not.toContain("is-over");
		drag(row, "dragover", t);
		expect(row.className).toContain("is-over");
	});

	it("busy: nothing drags, drops are ignored, and buttons are disabled", () => {
		const { a } = setup({ busy: true });
		expect(
			screen.getByText("Home").closest("button")?.getAttribute("draggable"),
		).toBe("false");
		expect(folder("Solo").getAttribute("draggable")).toBe("false");
		drag(
			folder("Solo").closest(".tree-row") as HTMLElement,
			"drop",
			transfer({
				kind: "note",
				path: "Home.vnote",
				readOnly: false,
			}),
		);
		expect(a.move).not.toHaveBeenCalled();
		expect(
			(screen.getByRole("button", { name: "New folder" }) as HTMLButtonElement)
				.disabled,
		).toBe(true);
		fireEvent.contextMenu(folder("Solo"));
		for (const item of screen.getAllByRole("menuitem"))
			expect(item.hasAttribute("data-disabled")).toBe(true);
	});

	it("busy also ignores a new-folder request from outside", () => {
		const a = actions();
		const { view } = setup({ busy: true, newFolderRequest: 0 }, a);
		view.rerender(
			<TooltipProvider>
				<NoteTree
					nodes={nodes()}
					livePath={null}
					onOpen={() => {}}
					actions={a}
					busy
					newFolderRequest={1}
				/>
			</TooltipProvider>,
		);
		expect(screen.queryByLabelText("New folder name")).toBeNull();
	});
});

describe("custom header", () => {
	it("replaces the toolbar and hands over a way to start a root folder", async () => {
		const { a } = setup({
			header: (create) => (
				<button type="button" onClick={create}>
					My header
				</button>
			),
		});
		expect(screen.queryByRole("button", { name: "New folder" })).toBeNull();
		await userEvent.click(screen.getByRole("button", { name: "My header" }));
		await userEvent.type(screen.getByLabelText("New folder name"), "Z{Enter}");
		expect(a.createFolder).toHaveBeenCalledWith("", "Z");
	});
});

describe("row menu (right-click)", () => {
	const full = (): TreeActions => ({
		...actions(),
		renameNote: vi.fn(),
		duplicateNote: vi.fn(),
		moveTo: vi.fn(),
		newNote: vi.fn(),
		newCanvas: vi.fn(),
	});
	const rightClick = (name: string) =>
		fireEvent.contextMenu(
			screen.getByRole("button", { name: new RegExp(`^${name}`) }),
		);
	const items = () =>
		screen.getAllByRole("menuitem").map((el) => el.textContent);

	it("a note offers Open, Rename, Duplicate, Move to and Move to trash", async () => {
		const { a } = setup({}, full());
		rightClick("Home");
		expect(items()).toEqual([
			"Open",
			"Rename",
			"Duplicate",
			"Move to…",
			"Icon and colour…",
			"Move to trash",
		]);
		await userEvent.click(screen.getByRole("menuitem", { name: "Duplicate" }));
		expect(a.duplicateNote).toHaveBeenCalledWith("Home.vnote");
		rightClick("Board");
		await userEvent.click(screen.getByRole("menuitem", { name: "Move to…" }));
		expect(a.moveTo).toHaveBeenCalledWith({
			kind: "note",
			path: "Board.vnote",
			readOnly: false,
		});
	});

	it("a read-only note offers only Open and Move to trash", () => {
		setup({ expandAll: true }, full());
		rightClick("Note B");
		expect(items()).toEqual(["Open", "Move to trash"]);
	});

	it("Rename opens a name field; Enter renames, the same name changes nothing", async () => {
		const { a } = setup({}, full());
		rightClick("Home");
		await userEvent.click(screen.getByRole("menuitem", { name: "Rename" }));
		const field = screen.getByLabelText("Rename note Home");
		// Focus moves in an effect after the menu closes.
		await waitFor(() => expect(document.activeElement).toBe(field));
		await userEvent.clear(field);
		await userEvent.type(field, "Start page{Enter}");
		expect(a.renameNote).toHaveBeenCalledWith("Home.vnote", "Start page");
		rightClick("Home");
		await userEvent.click(screen.getByRole("menuitem", { name: "Rename" }));
		await userEvent.type(screen.getByLabelText("Rename note Home"), "{Enter}");
		expect(a.renameNote).toHaveBeenCalledTimes(1);
	});

	it("opens from the keyboard's menu key on a focused row", async () => {
		const { a } = setup({}, full());
		const home = folder("Home");
		home.focus();
		// Shift+F10 and the menu key make the browser send this event.
		fireEvent.contextMenu(home);
		await userEvent.click(
			screen.getByRole("menuitem", { name: "Move to trash" }),
		);
		expect(a.deleteNote).toHaveBeenCalledWith("Home.vnote");
	});

	it("Icon and colour opens the style editor for that row, with no hover buttons", async () => {
		const { view } = setup({}, full());
		expect(view.container.querySelector(".tree-actions")).toBeNull();
		await choose("Home", "Icon and colour…");
		const editor = screen.getByRole("dialog");
		expect(editor.textContent).toContain("Home");
	});

	it("a folder offers new items here, rename, move and a confirmed trash", async () => {
		const { a } = setup({}, full());
		rightClick("Solo");
		expect(items()).toEqual([
			"New note here",
			"New canvas here",
			"New folder here",
			"Rename",
			"Move to…",
			"Icon and colour…",
			"Move to trash",
		]);
		await userEvent.click(
			screen.getByRole("menuitem", { name: "New note here" }),
		);
		expect(a.newNote).toHaveBeenCalledWith("Solo");
		rightClick("Solo");
		await userEvent.click(
			screen.getByRole("menuitem", { name: "Move to trash" }),
		);
		expect(a.deleteFolder).not.toHaveBeenCalled();
		expect(screen.getByRole("alert").textContent).toContain(
			"Move Solo to the trash",
		);
	});

	it("hides actions the app does not offer and disables everything while busy", () => {
		setup({ busy: true });
		rightClick("Home");
		expect(items()).toEqual(["Open", "Icon and colour…", "Move to trash"]);
		for (const item of screen.getAllByRole("menuitem"))
			expect(item.hasAttribute("data-disabled")).toBe(true);
	});
});
