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

it("cycles the tone when the icon is clicked, and not when read-only", async () => {
	const editor = open({
		type: "doc",
		content: [
			{
				type: "callout",
				attrs: { id: "c", tone: "danger" },
				content: [para("a", "Text")],
			},
		],
	});
	await waitFor(() =>
		expect(document.querySelector(".callout-icon")).not.toBeNull(),
	);
	const icon = document.querySelector(".callout-icon") as HTMLButtonElement;
	fireEvent.click(icon);
	expect(editor.getJSON().content?.[0]?.attrs?.tone).toBe("note");
	// The view re-renders after the change; a real click comes after that.
	await waitFor(() => expect(icon.title).toContain("note"));
	fireEvent.click(icon);
	expect(editor.getJSON().content?.[0]?.attrs?.tone).toBe("info");
	act(() => editor.setEditable(false));
	await waitFor(() =>
		expect(
			(document.querySelector(".callout-icon") as HTMLButtonElement).disabled,
		).toBe(true),
	);
});
