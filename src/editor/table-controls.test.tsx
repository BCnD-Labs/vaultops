// @vitest-environment happy-dom

import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import type { JSONContent } from "@tiptap/core";
import { type Editor, EditorContent, useEditor } from "@tiptap/react";
import { afterEach, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { blocksToDoc, docToBlocks } from "./doc-blocks";
import { createExtensions } from "./extensions";
import { NoteEditor } from "./NoteEditor";
import { TABLE_MENU_ACTIONS } from "./table-controls";

vi.mock("@tiptap/extension-drag-handle-react", () => ({ default: () => null }));

let current: Editor | null = null;

function Harness({ content }: { content: object }) {
	const editor = useEditor({ extensions: createExtensions(), content });
	current = editor;
	return <EditorContent editor={editor} />;
}

const cell = (id: string, text: string, type = "tableCell") => ({
	type,
	attrs: { id },
	content: [
		{
			type: "paragraph",
			attrs: { id: `${id}-p` },
			content: [{ type: "text", text }],
		},
	],
});
const row = (id: string, cells: object[]) => ({
	type: "tableRow",
	attrs: { id },
	content: cells,
});
/** A 2 x 2 table: a header row and one body row. */
const TABLE: JSONContent = {
	type: "doc",
	content: [
		{
			type: "table",
			attrs: { id: "t" },
			content: [
				row("r1", [
					cell("a1", "A1", "tableHeader"),
					cell("b1", "B1", "tableHeader"),
				]),
				row("r2", [cell("a2", "A2"), cell("b2", "B2")]),
			],
		},
	],
};

const table = (editor: Editor): JSONContent | undefined =>
	editor.getJSON().content?.[0];
const rows = (editor: Editor): JSONContent[] => table(editor)?.content ?? [];
const columns = (editor: Editor) => rows(editor)[0]?.content?.length ?? 0;

/** An editor with the caret in the cell that has this text. */
function openAt(text: string): Editor {
	render(<Harness content={TABLE} />);
	const editor = current;
	if (!editor) throw new Error("editor did not start");
	let found = -1;
	editor.state.doc.descendants((node, pos) => {
		if (node.isText && node.text === text) found = pos + 1;
	});
	editor.commands.setTextSelection(found);
	return editor;
}

afterEach(() => {
	cleanup();
	current = null;
});

it("runs every right-click menu action on the cell the caret is in", () => {
	const act = (id: string) => {
		const action = TABLE_MENU_ACTIONS.find((a) => a.id === id);
		if (!action) throw new Error(id);
		return action;
	};
	expect(TABLE_MENU_ACTIONS.map((a) => a.label)).toEqual([
		"Insert row above",
		"Insert row below",
		"Insert column left",
		"Insert column right",
		"Delete row",
		"Delete column",
		"Toggle header row",
		"Delete table",
	]);
	const editor = openAt("A2");
	act("row-above").run(editor);
	expect(rows(editor)).toHaveLength(3);
	// The new row went above the caret's row, between the header and "A2".
	expect(rows(editor)[2]?.content?.[0]?.content?.[0]?.content?.[0]?.text).toBe(
		"A2",
	);
	act("row-below").run(editor);
	expect(rows(editor)).toHaveLength(4);
	act("column-left").run(editor);
	expect(columns(editor)).toBe(3);
	act("column-right").run(editor);
	expect(columns(editor)).toBe(4);
	act("delete-column").run(editor);
	expect(columns(editor)).toBe(3);
	act("delete-row").run(editor);
	expect(rows(editor)).toHaveLength(3);
});

it("toggles the header row and deletes the table", () => {
	const editor = openAt("A1");
	const types = () => rows(editor)[0]?.content?.map((c: JSONContent) => c.type);
	expect(types()).toEqual(["tableHeader", "tableHeader"]);
	TABLE_MENU_ACTIONS.find((a) => a.id === "toggle-header")?.run(editor);
	expect(types()).toEqual(["tableCell", "tableCell"]);
	TABLE_MENU_ACTIONS.find((a) => a.id === "delete-table")?.run(editor);
	expect(table(editor)?.type).not.toBe("table");
});

it("moves between cells with Tab and Shift+Tab, and Tab in the last cell adds a row", () => {
	const editor = openAt("A1");
	const press = (shiftKey: boolean) =>
		editor.view.someProp("handleKeyDown", (f) =>
			f(
				editor.view,
				new KeyboardEvent("keydown", {
					key: "Tab",
					shiftKey,
					cancelable: true,
				}),
			),
		);
	const here = () => editor.state.selection.$from.parent.textContent;
	expect(press(false)).toBe(true);
	expect(here()).toBe("B1");
	press(false);
	expect(here()).toBe("A2");
	press(true);
	expect(here()).toBe("B1");
	press(false);
	press(false);
	expect(here()).toBe("B2");
	expect(rows(editor)).toHaveLength(2);
	press(false);
	expect(rows(editor)).toHaveLength(3);
});

it("keeps a table with a new row and column round-tripping with unique ids", () => {
	const editor = openAt("B2");
	TABLE_MENU_ACTIONS.find((a) => a.id === "row-below")?.run(editor);
	TABLE_MENU_ACTIONS.find((a) => a.id === "column-right")?.run(editor);
	expect(rows(editor)).toHaveLength(3);
	expect(columns(editor)).toBe(3);
	const blocks = docToBlocks(editor.getJSON());
	const ids = blocks.map((b) => b.id);
	expect(ids.every((id) => typeof id === "string" && id !== "")).toBe(true);
	expect(new Set(ids).size).toBe(ids.length);
	// 1 table + 3 rows + 9 cells, each cell with its paragraph.
	expect(blocks.filter((b) => b.type === "tableRow")).toHaveLength(3);
	expect(
		blocks.filter((b) => b.type === "tableCell" || b.type === "tableHeader"),
	).toHaveLength(9);
	const again = docToBlocks(blocksToDoc(blocks));
	expect(again).toEqual(blocks);
});

it("is resizable: column widths are kept on the cells", () => {
	const editor = openAt("A1");
	expect(editor.view.dom.querySelector(".tableWrapper")).not.toBeNull();
	expect(editor.view.dom.querySelector("colgroup")).not.toBeNull();
});

function renderNote(
	onChange: (doc: JSONContent) => void,
	editable = true,
	doc: JSONContent = TABLE,
) {
	return render(
		<TooltipProvider>
			<NoteEditor
				noteId="n"
				doc={doc}
				onChange={onChange}
				editable={editable}
			/>
		</TooltipProvider>,
	);
}
const lastDoc = (onChange: ReturnType<typeof vi.fn>) =>
	onChange.mock.calls.at(-1)?.[0] as JSONContent;
const shape = (doc: JSONContent) => {
	const t = doc.content?.[0];
	return {
		rows: t?.content?.length ?? 0,
		columns: t?.content?.[0]?.content?.length ?? 0,
	};
};

it("shows the + bars over a hovered table and they add a column and a row at the end", async () => {
	const onChange = vi.fn();
	const { container } = renderNote(onChange);
	expect(screen.queryByRole("button", { name: "Add column" })).toBeNull();
	const td = container.querySelector("td") as HTMLElement;
	fireEvent.mouseMove(td);
	fireEvent.click(await screen.findByRole("button", { name: "Add column" }));
	expect(shape(lastDoc(onChange))).toEqual({ rows: 2, columns: 3 });
	fireEvent.mouseMove(td);
	fireEvent.click(await screen.findByRole("button", { name: "Add row" }));
	expect(shape(lastDoc(onChange))).toEqual({ rows: 3, columns: 3 });
	// The new column and row went at the end: the original cells keep their places.
	const first = lastDoc(onChange).content?.[0]?.content?.[0]?.content;
	expect(first?.[0]?.content?.[0]?.content?.[0]?.text).toBe("A1");
	expect(first?.[2]?.content?.[0]?.content).toBeUndefined();
});

it("hides the + bars when the pointer leaves, and has none in a read-only note", async () => {
	const { container, unmount } = renderNote(vi.fn());
	const td = container.querySelector("td") as HTMLElement;
	fireEvent.mouseMove(td);
	await screen.findByRole("button", { name: "Add row" });
	fireEvent.mouseLeave(container.querySelector("section") as HTMLElement);
	await waitFor(() =>
		expect(screen.queryByRole("button", { name: "Add row" })).toBeNull(),
	);
	unmount();
	const readOnly = renderNote(vi.fn(), false);
	fireEvent.mouseMove(readOnly.container.querySelector("td") as HTMLElement);
	expect(screen.queryByRole("button", { name: "Add row" })).toBeNull();
});

it("opens a table menu on right-click in a cell and applies the chosen action", async () => {
	const onChange = vi.fn();
	const { container } = renderNote(onChange);
	const td = container.querySelectorAll("td")[0] as HTMLElement;
	fireEvent.mouseDown(td, { button: 2 });
	fireEvent.contextMenu(td);
	const menu = await screen.findByRole("menu");
	expect(
		within(menu)
			.getAllByRole("menuitem")
			.map((item) => item.textContent),
	).toEqual(TABLE_MENU_ACTIONS.map((a) => a.label));
	fireEvent.click(within(menu).getByText("Insert row below"));
	await waitFor(() => expect(shape(lastDoc(onChange)).rows).toBe(3));
});

it("leaves the system menu alone outside a table", () => {
	const withText: JSONContent = {
		type: "doc",
		content: [
			...(TABLE.content ?? []),
			{
				type: "paragraph",
				attrs: { id: "after" },
				content: [{ type: "text", text: "after" }],
			},
		],
	};
	const { container } = renderNote(vi.fn(), true, withText);
	const outside = container.querySelector(".ProseMirror > p") as HTMLElement;
	fireEvent.mouseDown(outside, { button: 2 });
	fireEvent.contextMenu(outside);
	expect(screen.queryByRole("menu")).toBeNull();
});
