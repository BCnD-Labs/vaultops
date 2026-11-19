// @vitest-environment happy-dom

import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from "@testing-library/react";
import { EditorContent, useEditor } from "@tiptap/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { NoteRow } from "../../app/session";
import { createViewRows } from "../../app/view-rows";
import { createExtensions } from "../extensions";
import { LiveViewSource } from "./live-view";

// No observer: every view counts as on screen.
beforeEach(() => vi.stubGlobal("IntersectionObserver", undefined));
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

const note = (path: string, extra: Partial<NoteRow> = {}): NoteRow =>
	({
		path,
		title: path.split("/").pop()?.replace(".vnote", "") ?? path,
		tags: [],
		readOnly: false,
		fields: {},
		...extra,
	}) as NoteRow;

const status = (value: string) => ({
	status: { name: "Status", type: "select" as const, value, options: [value] },
});

function Harness({ attrs }: { attrs: object }) {
	const editor = useEditor({
		extensions: createExtensions(),
		content: {
			type: "doc",
			content: [{ type: "liveView", attrs: { id: "v", ...attrs } }],
		},
	});
	return <EditorContent editor={editor} />;
}

function show(attrs: object, notes: NoteRow[]) {
	const rows = createViewRows();
	rows.sync(notes);
	const open = vi.fn();
	render(
		<LiveViewSource.Provider
			value={{ rows, hostPath: "Books/Shelf.vnote", open }}
		>
			<Harness attrs={attrs} />
		</LiveViewSource.Provider>,
	);
	return { rows, open };
}

const titles = () =>
	screen
		.queryAllByRole("row")
		.slice(1)
		.map((row) => within(row).getAllByRole("cell")[0]?.textContent);

const folderRule = {
	match: "all",
	conditions: [{ field: "folder", op: "in", value: "Books", sub: false }],
};

it("lists only matching notes, sorted, without the host note or templates", async () => {
	const { rows, open } = show(
		{
			title: "Shelf",
			rule: folderRule,
			sort: [{ field: "title", dir: "desc" }],
			columns: ["title", "prop:Status"],
		},
		[
			note("Books/Shelf.vnote"),
			note("Books/Alpha.vnote", { fields: status("Reading") }),
			note("Books/Beta.vnote"),
			note("Books/deep/Gamma.vnote"),
			note("Other/Delta.vnote"),
			note(".vaultops/templates/Books/Tpl.vnote"),
		],
	);
	expect(await screen.findByText("2 notes")).toBeTruthy();
	expect(titles()).toEqual(["Beta", "Alpha"]);
	expect(screen.getByRole("columnheader", { name: /Status/ })).toBeTruthy();
	expect(screen.getByText("Reading")).toBeTruthy();
	expect(screen.getByLabelText("Sorted descending")).toBeTruthy();
	fireEvent.click(screen.getByRole("button", { name: "Alpha" }));
	expect(open).toHaveBeenCalledWith("Books/Alpha.vnote");
	// A new note in the folder shows up without touching the block.
	act(() =>
		rows.sync([
			note("Books/Alpha.vnote"),
			note("Books/Beta.vnote"),
			note("Books/Cee.vnote"),
		]),
	);
	expect(titles()).toEqual(["Cee", "Beta", "Alpha"]);
});

it("shows a newer view's notice instead of rows", async () => {
	show({ v: 2, rule: folderRule }, [note("Books/Alpha.vnote")]);
	expect(
		await screen.findByText(
			"This view was made by a newer version of VaultOps.",
		),
	).toBeTruthy();
	expect(titles()).toEqual([]);
});

it("shows rows up to the limit, then more on request", async () => {
	show({ rule: folderRule, limit: 1 }, [
		note("Books/A.vnote"),
		note("Books/B.vnote"),
	]);
	expect(await screen.findByText("2 notes")).toBeTruthy();
	expect(titles()).toEqual(["A"]);
	fireEvent.click(screen.getByRole("button", { name: "Show more (1)" }));
	expect(titles()).toEqual(["A", "B"]);
});
