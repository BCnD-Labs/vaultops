// @vitest-environment happy-dom
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
} from "@testing-library/react";
import type { Editor } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import { afterEach, expect, it } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { blocksToDoc, docToBlocks } from "./doc-blocks";
import { createExtensions } from "./extensions";
import { FormatBar } from "./FormatBar";

afterEach(cleanup);

let current: Editor | null = null;

function Harness() {
	const editor = useEditor({
		extensions: createExtensions(),
		content: {
			type: "doc",
			content: [
				{
					type: "paragraph",
					attrs: { id: "p1" },
					content: [{ type: "text", text: "Hello world" }],
				},
			],
		},
	});
	current = editor;
	return editor ? (
		<TooltipProvider>
			<FormatBar editor={editor} />
			<EditorContent editor={editor} />
		</TooltipProvider>
	) : null;
}

function marksOfFirstWord(): string[] {
	const first = current?.getJSON().content?.[0]?.content?.[0];
	return (first?.marks ?? []).map((mark) => mark.type);
}

function select(from: number, to: number) {
	act(() => {
		current?.commands.setTextSelection({ from, to });
	});
}

it("offers every formatting mark and applies each to the selected text", async () => {
	render(<Harness />);
	await screen.findByRole("toolbar", { name: "Text formatting" });
	select(1, 6);
	for (const [label, mark] of [
		["Bold", "bold"],
		["Italic", "italic"],
		["Underline", "underline"],
		["Strikethrough", "strike"],
		["Highlight", "highlight"],
		["Code", "code"],
	] as const) {
		fireEvent.click(screen.getByRole("button", { name: label }));
		expect(marksOfFirstWord()).toContain(mark);
		expect(
			screen.getByRole("button", { name: label }).getAttribute("aria-pressed"),
		).toBe("true");
	}
});

it("turns a mark off again", async () => {
	render(<Harness />);
	await screen.findByRole("toolbar", { name: "Text formatting" });
	select(1, 6);
	const highlight = screen.getByRole("button", { name: "Highlight" });
	fireEvent.click(highlight);
	expect(marksOfFirstWord()).toContain("highlight");
	fireEvent.click(highlight);
	expect(marksOfFirstWord()).not.toContain("highlight");
	expect(highlight.getAttribute("aria-pressed")).toBe("false");
});

it("makes subscript and superscript exclusive", async () => {
	render(<Harness />);
	await screen.findByRole("toolbar", { name: "Text formatting" });
	select(1, 6);
	fireEvent.click(screen.getByRole("button", { name: "Subscript" }));
	expect(marksOfFirstWord()).toContain("subscript");
	fireEvent.click(screen.getByRole("button", { name: "Superscript" }));
	expect(marksOfFirstWord()).toContain("superscript");
	expect(marksOfFirstWord()).not.toContain("subscript");
});

it("keeps the new marks through the note file round trip", async () => {
	render(<Harness />);
	await screen.findByRole("toolbar", { name: "Text formatting" });
	select(1, 6);
	for (const label of ["Underline", "Highlight", "Superscript"])
		fireEvent.click(screen.getByRole("button", { name: label }));
	const doc = current?.getJSON();
	if (!doc) throw new Error("no editor");
	const back = blocksToDoc(docToBlocks(doc));
	const marks = (back.content?.[0]?.content?.[0]?.marks ?? [])
		.map((mark) => mark.type)
		.sort();
	expect(marks).toEqual(["highlight", "superscript", "underline"]);
});
