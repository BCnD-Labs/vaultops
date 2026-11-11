// @vitest-environment happy-dom

import {
	act,
	cleanup,
	fireEvent,
	render,
	waitFor,
} from "@testing-library/react";
import { type Editor, EditorContent, useEditor } from "@tiptap/react";
import { afterEach, expect, it } from "vitest";
import { docToBlocks } from "./doc-blocks";
import { createExtensions } from "./extensions";

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

const para = (id: string, text?: string) => ({
	type: "paragraph",
	attrs: { id },
	...(text ? { content: [{ type: "text", text }] } : {}),
});
const types = (editor: Editor) =>
	(editor.getJSON().content ?? []).map((node) => node.type);

afterEach(() => {
	cleanup();
	current = null;
});

it("turns --- typed in an empty paragraph into a divider and a fresh paragraph", () => {
	const editor = open({ type: "doc", content: [para("a", "--")] });
	act(() => {
		editor.commands.setTextSelection(3);
		const { view } = editor;
		view.someProp("handleTextInput", (f) =>
			f(view, 3, 3, "-", () => view.state.tr),
		);
	});
	expect(types(editor)).toEqual(["divider", "paragraph"]);
	expect(editor.state.selection.$from.parent.type.name).toBe("paragraph");
});

it("wraps a paragraph in a callout with the chosen tone", () => {
	const editor = open({ type: "doc", content: [para("a", "Heads up")] });
	act(() => {
		editor.chain().setTextSelection(2).wrapIn("callout", { tone: "tip" }).run();
	});
	const [callout] = editor.getJSON().content ?? [];
	expect(callout?.type).toBe("callout");
	expect(callout?.attrs?.tone).toBe("tip");
	const blocks = docToBlocks(editor.getJSON());
	expect(blocks.find((b) => b.type === "callout")?.attrs).toEqual({
		tone: "tip",
	});
});

it("leaves the callout when Enter is pressed on an empty last line", () => {
	const editor = open({
		type: "doc",
		content: [
			{
				type: "callout",
				attrs: { id: "c", tone: "note" },
				content: [para("a", "Text"), para("b")],
			},
		],
	});
	act(() => {
		editor.commands.setTextSelection(editor.state.doc.content.size - 2);
		editor.commands.keyboardShortcut("Enter");
	});
	expect(types(editor)).toEqual(["callout", "paragraph"]);
	expect(editor.state.doc.firstChild?.childCount).toBe(1);
});

it("unwraps the callout when Backspace is pressed at its very start", () => {
	const editor = open({
		type: "doc",
		content: [
			{
				type: "callout",
				attrs: { id: "c", tone: "warning" },
				content: [para("a", "Text"), para("b", "More")],
			},
		],
	});
	act(() => {
		editor.commands.setTextSelection(2);
		editor.commands.keyboardShortcut("Backspace");
	});
	expect(types(editor)).toEqual(["paragraph", "callout"]);
});

it("opens the callout style picker to change preset, icon and colour, and disables when read-only", async () => {
	const editor = open({
		type: "doc",
		content: [
			{
				type: "callout",
				attrs: { id: "c", tone: "danger" },
				content: [para("a", "Title line"), para("b", "Body line")],
			},
		],
	});
	await waitFor(() =>
		expect(document.querySelector(".callout-icon")).not.toBeNull(),
	);
	const icon = document.querySelector(".callout-icon") as HTMLButtonElement;
	fireEvent.click(icon);

	const infoPreset = await waitFor(() => {
		const btn = document.querySelector<HTMLButtonElement>(
			'[aria-label="Callout preset info"]',
		);
		if (!btn) throw new Error("no info preset");
		return btn;
	});
	fireEvent.click(infoPreset);
	expect(editor.getJSON().content?.[0]?.attrs?.tone).toBe("info");

	const purpleSwatch = document.querySelector<HTMLButtonElement>(
		'.callout-style-popover [aria-label="Colour purple"]',
	);
	if (!purpleSwatch) throw new Error("no purple swatch");
	fireEvent.click(purpleSwatch);
	expect(editor.getJSON().content?.[0]?.attrs?.color).toBe("purple");

	const flameIcon = document.querySelector<HTMLButtonElement>(
		'.callout-style-popover [aria-label="Icon flame"]',
	);
	if (!flameIcon) throw new Error("no flame icon");
	fireEvent.click(flameIcon);
	expect(editor.getJSON().content?.[0]?.attrs?.icon).toBe("flame");
	expect(
		docToBlocks(editor.getJSON()).find((b) => b.type === "callout")?.attrs,
	).toEqual({
		tone: "info",
		icon: "flame",
		color: "purple",
	});

	act(() => editor.setEditable(false));
	await waitFor(() =>
		expect(
			(document.querySelector(".callout-icon") as HTMLButtonElement).disabled,
		).toBe(true),
	);
});

it("picks a quote bar colour from the handle or right-click, and leaves default out of blocks", () => {
	const editor = open({
		type: "doc",
		content: [
			{
				type: "blockquote",
				attrs: { id: "q" },
				content: [para("a", "Quoted text")],
			},
		],
	});
	const quote = document.querySelector("blockquote");
	if (!quote) throw new Error("no blockquote");
	expect(quote.getAttribute("data-color")).toBeNull();

	const handle = document.querySelector<HTMLButtonElement>(
		".quote-color-handle",
	);
	if (!handle) throw new Error("no quote colour handle");
	fireEvent.click(handle);
	const popover = document.querySelector<HTMLElement>(".quote-color-popover");
	expect(popover?.hidden).toBe(false);

	const blue = document.querySelector<HTMLButtonElement>(
		'.quote-color-popover [aria-label="Colour blue"]',
	);
	if (!blue) throw new Error("no blue swatch");
	act(() => {
		fireEvent.click(blue);
	});
	expect(editor.getJSON().content?.[0]?.attrs?.color).toBe("blue");
	expect(document.querySelector("blockquote")?.getAttribute("data-color")).toBe(
		"blue",
	);
	expect(
		docToBlocks(editor.getJSON()).find((b) => b.type === "blockquote")?.attrs,
	).toEqual({ color: "blue" });

	const updatedQuote = document.querySelector("blockquote");
	if (!updatedQuote) throw new Error("no updated blockquote");
	fireEvent.contextMenu(updatedQuote);
	const none = document.querySelector<HTMLButtonElement>(
		'.quote-color-popover [aria-label="No colour"]',
	);
	if (!none) throw new Error("no reset swatch");
	act(() => {
		fireEvent.click(none);
	});
	expect(editor.getJSON().content?.[0]?.attrs?.color).toBeNull();
	expect(
		docToBlocks(editor.getJSON()).find((b) => b.type === "blockquote")?.attrs,
	).toBeUndefined();
});
