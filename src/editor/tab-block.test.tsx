// @vitest-environment happy-dom

import { readFileSync } from "node:fs";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { type Editor, EditorContent, useEditor } from "@tiptap/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Note } from "../core/note-format";
import { createNote, saveNote } from "../core/notes/repository";
import { openVault } from "../core/vault/vault";
import { MemoryHost } from "../host/memory-host";
import { createExtensions } from "./extensions";
import { hiddenSources } from "./mermaid-block";
import { openNote, saveDoc } from "./note-io";

const TAB = [
	"Am      G",
	"e|-----0---|---------|",
	"B|---1-----|-3h5-----|",
	"G|-2-------|-----7b9~|",
	"D|---------|---------|",
	"A|-0-------|---------|",
	"E|---------|-3-------|",
	"Verse riff",
].join("\n");

let current: Editor | null = null;

function Harness({
	content,
	editable,
}: {
	content: object;
	editable: boolean;
}) {
	const editor = useEditor({
		extensions: createExtensions(),
		content,
		editable,
	});
	current = editor;
	return (
		<div className="note-editor">
			<EditorContent editor={editor} />
		</div>
	);
}

function open(blocks: object[], editable = true): Editor {
	render(
		<Harness content={{ type: "doc", content: blocks }} editable={editable} />,
	);
	if (!current) throw new Error("editor did not start");
	return current;
}

const code = (text: string, language: string | null = "tab") => ({
	type: "codeBlock",
	attrs: { id: "t", language },
	content: [{ type: "text", text }],
});

const svg = () => document.querySelector(".tab-block svg.tab-svg");

beforeEach(() => {
	vi.stubGlobal("ResizeObserver", undefined);
	localStorage.clear();
});

afterEach(() => {
	cleanup();
	current = null;
	vi.unstubAllGlobals();
});

it("draws the tab beside its text once the language is tab", async () => {
	const editor = open([code(TAB, null)]);
	expect(document.querySelector(".tab-block")).toBeNull();
	act(() => {
		editor.commands.updateAttributes("codeBlock", { language: "tab" });
	});
	const block = document.querySelector(".tab-block");
	expect(block?.querySelector("pre code")?.textContent).toContain("e|-----0");
	expect(svg()?.querySelectorAll(".tab-string")).toHaveLength(6);
	expect(svg()?.querySelectorAll(".tab-clef")).toHaveLength(3);
	const frets = [...(svg()?.querySelectorAll(".tab-fret") ?? [])];
	expect(frets.map((f) => f.textContent)).toContain("0");
	const chords = [...(svg()?.querySelectorAll(".tab-chord") ?? [])];
	expect(chords.map((c) => c.textContent)).toEqual(["Am", "G"]);
	expect(svg()?.querySelector(".tab-label")?.textContent).toBe("H");
	expect(svg()?.innerHTML).toContain(">full<");
	// The line that is not tab stays in the text and is named quietly.
	expect(document.querySelector(".mermaid-error")?.textContent).toBe(
		"Not drawn, kept in the text: “Verse riff”",
	);
	expect(editor.state.doc.textContent).toBe(TAB);
});

it("draws again shortly after typing stops", async () => {
	const editor = open([code(TAB)]);
	const count = () => svg()?.querySelectorAll(".tab-fret").length ?? 0;
	const before = count();
	act(() => {
		// Into the e string, just after "e|-".
		editor.commands.insertContentAt(1 + "Am      G\ne|-".length, "5");
	});
	expect(count()).toBe(before);
	await vi.waitFor(() => expect(count()).toBe(before + 1));
});

it("hides the text without changing the saved block, and remembers it", () => {
	const editor = open([code(TAB)]);
	const before = JSON.stringify(editor.getJSON());
	const block = document.querySelector<HTMLElement>(".tab-block");
	const toggle = document.querySelector<HTMLButtonElement>(".mermaid-toggle");
	expect(block?.dataset.source).toBe("shown");
	expect(toggle?.textContent).toBe("Tab only");
	fireEvent.click(toggle as HTMLButtonElement);
	expect(block?.dataset.source).toBe("hidden");
	expect(toggle?.getAttribute("aria-pressed")).toBe("true");
	expect(JSON.stringify(editor.getJSON())).toBe(before);
	expect(hiddenSources()).toEqual(["t"]);

	cleanup();
	open([code(TAB)]);
	expect(
		document.querySelector<HTMLElement>(".tab-block")?.dataset.source,
	).toBe("hidden");
});

it("removes the hidden source from layout and fits the card to the drawing", () => {
	const style = document.head.appendChild(document.createElement("style"));
	style.textContent = readFileSync("src/editor/editor.css", "utf8");
	try {
		hiddenSources(["t"]);
		open([code(TAB)]);
		const pre = document.querySelector("pre");
		const panel = document.querySelector(".mermaid-view");
		if (!pre || !panel) throw new Error("missing tab block");
		expect(getComputedStyle(pre).display).toBe("none");
		expect(getComputedStyle(panel).width).toBe("fit-content");
		expect(getComputedStyle(panel).maxWidth).toBe("100%");
	} finally {
		style.remove();
	}
});

it("shows only the drawing in a read-only note", () => {
	const style = document.head.appendChild(document.createElement("style"));
	style.textContent = readFileSync("src/editor/editor.css", "utf8");
	open([code(TAB)], false);
	const block = document.querySelector(".tab-block") as HTMLElement;
	const hidden = (el: Element | null) =>
		el && getComputedStyle(el).display === "none";
	expect(hidden(block.querySelector("pre"))).toBe(true);
	expect(hidden(block.querySelector(".mermaid-controls"))).toBe(true);
	expect(svg()).not.toBeNull();
	style.remove();
});

it("round-trips a note with a tab block to identical bytes", async () => {
	const host = new MemoryHost();
	await openVault(host);
	const { path, note } = await createNote(host, "", "Riffs");
	const blocks: Note["blocks"] = [
		{
			id: "t",
			type: "codeBlock",
			parent: null,
			attrs: { language: "tab" },
			content: [{ type: "text", text: TAB }] as never,
		},
	];
	await saveNote(host, path, { ...note, blocks });
	const before = await host.readText(path);
	const opened = await openNote(host, path);
	expect(opened.editable).toBe(true);
	const editor = open(opened.doc.content ?? []);
	expect(svg()).not.toBeNull();
	expect((await saveDoc(host, opened, editor.getJSON())).ok).toBe(true);
	expect(await host.readText(path)).toBe(before);
});
