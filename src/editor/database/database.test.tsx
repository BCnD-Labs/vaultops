// @vitest-environment happy-dom

import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import type { JSONContent } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";
import { type Editor, EditorContent, useEditor } from "@tiptap/react";
import { afterEach, describe, expect, it } from "vitest";
import { blocksToDoc, checkBlocks, docToBlocks } from "../doc-blocks";
import { createExtensions } from "../extensions";
import { SLASH_ITEMS } from "../slash-items";
import {
	addColumn,
	addRow,
	changeColumnType,
	deleteColumn,
	deleteRow,
	moveColumn,
	readDatabase,
	setCell,
	setRowContent,
	setSort,
} from "./commands";
import { TITLE_ID } from "./model";

let current: Editor | null = null;

function Harness({ content }: { content: object }) {
	const editor = useEditor({ extensions: createExtensions(), content });
	current = editor;
	return <EditorContent editor={editor} />;
}

function open(content: object): Editor {
	render(<Harness content={content} />);
	if (!current) throw new Error("editor did not start");
	return current;
}

afterEach(() => {
	cleanup();
	current = null;
});

const para = (id: string, text?: string): JSONContent => ({
	type: "paragraph",
	attrs: { id },
	...(text ? { content: [{ type: "text", text }] } : {}),
});
const row = (
	id: string,
	cells: object = {},
	...page: JSONContent[]
): JSONContent => ({
	type: "databaseRow",
	attrs: { id, cells },
	...(page.length ? { content: page } : {}),
});
const db = (rows: JSONContent[], attrs: object = {}): JSONContent => ({
	type: "database",
	attrs: { id: "db", ...attrs },
	content: rows,
});
const doc = (...content: JSONContent[]) => ({ type: "doc", content });

/** The database is the first block in these notes. */
const state = (editor: Editor) => {
	const found = readDatabase(editor.state.doc, 0);
	if (!found) throw new Error("no database at the top");
	return found;
};

describe("the note format", () => {
	it("stores the database and each row as their own lines, with the row page under its row", () => {
		const note = doc(
			db([row("r1", { title: "Dune" }, para("p1", "Notes")), row("r2")], {
				title: "Books",
			}),
			para("after"),
		);
		const blocks = docToBlocks(note);
		expect(blocks.map((b) => [b.type, b.id, b.parent])).toEqual([
			["database", "db", null],
			["databaseRow", "r1", "db"],
			["paragraph", "p1", "r1"],
			["databaseRow", "r2", "db"],
			["paragraph", "after", null],
		]);
		// Defaults are left out, so an unedited note saves back to the same bytes.
		expect(blocks[0]?.attrs).toEqual({ title: "Books" });
		expect(blocks[3]?.attrs).toBeUndefined();
		expect(checkBlocks(blocks)).toEqual({ ok: true });
		expect(docToBlocks(blocksToDoc(blocks))).toEqual(blocks);
	});

	it("refuses a database inside a column or a row page, and a row outside a database", () => {
		const nested = docToBlocks(
			doc({
				type: "columns",
				attrs: { id: "cs" },
				content: [
					{ type: "column", attrs: { id: "c1" }, content: [para("x")] },
					{ type: "column", attrs: { id: "c2" }, content: [para("y")] },
				],
			}),
		);
		nested.push({ id: "db", type: "database", parent: "c1" });
		expect(checkBlocks(nested).ok).toBe(false);
		expect(
			checkBlocks([{ id: "r", type: "databaseRow", parent: null }]).ok,
		).toBe(false);
		expect(
			checkBlocks([
				{ id: "db", type: "database", parent: null },
				{ id: "r", type: "databaseRow", parent: "db" },
				{ id: "db2", type: "database", parent: "r" },
			]).ok,
		).toBe(false);
	});

	it("refuses an attribute the database doesn't know", () => {
		const blocks = docToBlocks(doc(db([row("r1")])));
		blocks[0] = {
			...blocks[0],
			type: "database",
			parent: null,
			attrs: { view: "kanban" },
		};
		expect(checkBlocks(blocks).ok).toBe(false);
	});
});

describe("inserting", () => {
	it("turns a blank line into a database with Name, Tags and three rows, and leaves a line after it", () => {
		const editor = open(doc(para("a", "/database")));
		const item = SLASH_ITEMS.find((i) => i.id === "database");
		act(() => item?.run(editor, { from: 1, to: 10 }));
		const json = editor.getJSON().content ?? [];
		expect(json.map((n) => n.type)).toEqual(["database", "paragraph"]);
		const { columns, rows } = state(editor);
		expect(columns.map((c) => [c.name, c.type])).toEqual([
			["Name", "title"],
			["Tags", "multiSelect"],
		]);
		expect(new Set(rows.map((r) => r.id)).size).toBe(3);
		expect(editor.state.selection.$from.parent.type.name).toBe("paragraph");
	});

	it("does nothing from inside a list", () => {
		const editor = open(
			doc({
				type: "bulletList",
				attrs: { id: "ul" },
				content: [
					{
						type: "listItem",
						attrs: { id: "li" },
						content: [para("p", "/database")],
					},
				],
			}),
		);
		const item = SLASH_ITEMS.find((i) => i.id === "database");
		act(() => item?.run(editor, { from: 3, to: 12 }));
		expect(editor.getJSON().content?.map((n) => n.type)).toEqual([
			"bulletList",
		]);
	});
});

describe("editing", () => {
	it("adds, fills and deletes rows, and undoes a cell edit", () => {
		const editor = open(doc(db([row("r1")]), para("after")));
		let id: string | null = null;
		act(() => {
			id = addRow(editor, 0, { [TITLE_ID]: "New" });
		});
		expect(state(editor).rows.map((r) => r.cells)).toEqual([
			{},
			{ title: "New" },
		]);
		act(() => {
			setCell(editor, "r1", TITLE_ID, "First");
		});
		expect(state(editor).rows[0]?.cells).toEqual({ title: "First" });
		// Edits closer together than the history's grouping delay undo together.
		act(() => {
			editor.view.dispatch(closeHistory(editor.state.tr));
			setCell(editor, "r1", TITLE_ID, "");
		});
		expect(state(editor).rows[0]?.cells).toEqual({});
		act(() => {
			editor.commands.undo();
		});
		expect(state(editor).rows[0]?.cells).toEqual({ title: "First" });
		act(() => {
			if (id) deleteRow(editor, id);
		});
		expect(state(editor).rows.map((r) => r.id)).toEqual(["r1"]);
	});

	it("adds, moves, retypes and deletes columns, carrying values across", () => {
		const editor = open(
			doc(db([row("r1", { title: "A" }), row("r2", { title: "B" })])),
		);
		let est: string | null = null;
		let pages: string | null = null;
		act(() => {
			est = addColumn(editor, 0, "text");
			pages = addColumn(editor, 0, "number");
		});
		expect(state(editor).columns.map((c) => c.name)).toEqual([
			"Name",
			"Text",
			"Number",
		]);
		if (!est || !pages) throw new Error("columns not added");
		const estId: string = est;
		const pagesId: string = pages;
		act(() => {
			setCell(editor, "r1", estId, "42");
			setCell(editor, "r2", estId, "soon");
			changeColumnType(editor, 0, estId, "number");
		});
		expect(state(editor).rows.map((r) => r.cells[estId])).toEqual([
			42,
			undefined,
		]);
		act(() => {
			moveColumn(editor, 0, pagesId, -1);
		});
		expect(state(editor).columns.map((c) => c.id)).toEqual([
			TITLE_ID,
			pagesId,
			estId,
		]);
		// The title column never moves and never goes.
		act(() => {
			moveColumn(editor, 0, pagesId, -1);
			deleteColumn(editor, 0, TITLE_ID);
		});
		expect(state(editor).columns[0]?.id).toBe(TITLE_ID);
		act(() => {
			setSort(editor, 0, { column: estId, dir: "desc" });
			deleteColumn(editor, 0, estId);
		});
		const after = state(editor);
		expect(after.columns.map((c) => c.id)).toEqual([TITLE_ID, pagesId]);
		expect(after.rows.map((r) => r.cells)).toEqual([
			{ title: "A" },
			{ title: "B" },
		]);
		// A sort on a deleted column goes with it.
		expect(after.sort).toBeNull();
	});

	it("writes a row page back into the note and treats one empty line as no page", () => {
		const editor = open(doc(db([row("r1")])));
		act(() => {
			setRowContent(editor, "r1", [
				para("p1", "Chapter notes"),
				para("p2", "More"),
			]);
		});
		expect(state(editor).rows[0]?.node.childCount).toBe(2);
		act(() => {
			setRowContent(editor, "r1", [{ type: "paragraph" }]);
		});
		expect(state(editor).rows[0]?.node.childCount).toBe(0);
	});
});

describe("the view", () => {
	it("draws the columns and rows, and typing in a title cell saves it", async () => {
		const editor = open(
			doc(db([row("r1", { title: "Dune" })], { title: "Books" })),
		);
		await waitFor(() => expect(screen.getByDisplayValue("Dune")).toBeTruthy());
		expect(screen.getByDisplayValue("Books")).toBeTruthy();
		expect(screen.getByRole("columnheader", { name: /Name/ })).toBeTruthy();
		fireEvent.change(screen.getByDisplayValue("Dune"), {
			target: { value: "Dune Messiah" },
		});
		expect(state(editor).rows[0]?.cells.title).toBe("Dune Messiah");
	});

	it("opens a row's page in a side panel, edits it, and closes on Escape", async () => {
		const editor = open(
			doc(
				db([row("r1", { title: "Dune" }, para("p1", "Spice"))]),
				para("after"),
			),
		);
		await waitFor(() =>
			expect(screen.getByTitle("Open row page")).toBeTruthy(),
		);
		fireEvent.click(screen.getByTitle("Open row page"));
		const panel = await screen.findByRole("complementary", {
			name: "Row page",
		});
		expect(panel.textContent).toContain("Spice");
		// The title in the panel is the same cell as the table's.
		const titles = screen.getAllByDisplayValue("Dune");
		expect(titles).toHaveLength(2);
		fireEvent.change(titles[1] as HTMLElement, {
			target: { value: "Dune (1965)" },
		});
		expect(state(editor).rows[0]?.cells.title).toBe("Dune (1965)");
		// Typing in the page editor writes the row's blocks into the note.
		const page = panel.querySelector(".ProseMirror") as HTMLElement & {
			editor?: Editor;
		};
		const pageEditor = page.editor;
		expect(pageEditor).toBeTruthy();
		act(() => {
			pageEditor?.commands.insertContentAt(pageEditor.state.doc.content.size, {
				type: "paragraph",
				content: [{ type: "text", text: "Arrakis" }],
			});
		});
		expect(state(editor).rows[0]?.node.textContent).toBe("SpiceArrakis");
		fireEvent.keyDown(window, { key: "Escape" });
		await waitFor(() =>
			expect(
				screen.queryByRole("complementary", { name: "Row page" }),
			).toBeNull(),
		);
	});

	it("adds a Status column with Notion's three groups and steps a Progress bar", async () => {
		const editor = open(doc(db([row("r1", { title: "Essay" })])));
		let statusId: string | null = null;
		let progressId: string | null = null;
		act(() => {
			statusId = addColumn(editor, 0, "status");
			progressId = addColumn(editor, 0, "progress");
		});
		const status = state(editor).columns.find((c) => c.id === statusId);
		expect(status?.options?.map((o) => o.group)).toEqual([
			"todo",
			"doing",
			"done",
		]);
		const slider = await screen.findByRole("slider", { name: "Progress" });
		expect(slider.getAttribute("aria-valuenow")).toBe("0");
		fireEvent.keyDown(slider, { key: "ArrowRight" });
		await waitFor(() =>
			expect(slider.getAttribute("aria-valuenow")).toBe("25"),
		);
		fireEvent.keyDown(slider, { key: "ArrowRight" });
		await waitFor(() =>
			expect(slider.getAttribute("aria-valuenow")).toBe("50"),
		);
		expect(state(editor).rows[0]?.cells[progressId ?? ""]).toBe(50);
		fireEvent.keyDown(slider, { key: "ArrowLeft" });
		await waitFor(() =>
			expect(state(editor).rows[0]?.cells[progressId ?? ""]).toBe(25),
		);
	});

	it("shows no editing controls in a read-only note", async () => {
		render(<ReadOnly content={doc(db([row("r1", { title: "Dune" })]))} />);
		await waitFor(() => expect(screen.getByDisplayValue("Dune")).toBeTruthy());
		expect(screen.queryByText("New row")).toBeNull();
		expect(screen.queryByLabelText("Add property")).toBeNull();
		expect(
			(screen.getByDisplayValue("Dune") as HTMLInputElement).readOnly,
		).toBe(true);
	});
});

function ReadOnly({ content }: { content: object }) {
	const editor = useEditor({
		extensions: createExtensions(),
		content,
		editable: false,
	});
	return <EditorContent editor={editor} />;
}
