// @vitest-environment happy-dom

import { act, cleanup, render, waitFor } from "@testing-library/react";
import { type Editor, EditorContent, useEditor } from "@tiptap/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { previewOf, searchTextOf } from "../core/notes/scan";
import { blocksToDoc, docToBlocks } from "./doc-blocks";
import { createExtensions } from "./extensions";
import { MATH_SHOW_LIMIT } from "./MathField";
import { latexOf } from "./math-block";
import { SLASH_ITEMS } from "./slash-items";

// A stand-in for the MathLive editor element: it keeps a value, and the test
// types by setting it and sending `input`, as the real one does.
vi.mock("mathlive", () => {
	class FakeMathfield extends HTMLElement {
		static fontsDirectory: string | null = "https://example.invalid/fonts";
		static soundsDirectory: string | null = "https://example.invalid/sounds";
		static keypressSound: unknown = "x";
		static plonkSound: unknown = "x";
		static computeEngine: unknown = {};
		value = "";
		readOnly = false;
		mathVirtualKeyboardPolicy = "";
		focus() {
			this.dataset.focused = "true";
		}
	}
	if (!customElements.get("math-field")) {
		customElements.define("math-field", FakeMathfield);
	}
	return { MathfieldElement: FakeMathfield };
});

type Field = HTMLElement & {
	value: string;
	readOnly: boolean;
	mathVirtualKeyboardPolicy: string;
};

let current: Editor | null = null;

function Harness({ content }: { content: object }) {
	const editor = useEditor({ extensions: createExtensions(), content });
	current = editor;
	return <EditorContent editor={editor} />;
}

const math = (latex?: unknown) => ({
	type: "mathBlock",
	attrs: { id: "m", ...(latex === undefined ? {} : { latex }) },
});
const para = (id: string, text?: string) => ({
	type: "paragraph",
	attrs: { id },
	...(text ? { content: [{ type: "text", text }] } : {}),
});

async function open(...nodes: object[]): Promise<Editor> {
	render(<Harness content={{ type: "doc", content: nodes }} />);
	if (!current) throw new Error("editor did not start");
	if (nodes.some((node) => (node as { type: string }).type === "mathBlock")) {
		await waitFor(() =>
			expect(document.querySelector("math-field")).toBeTruthy(),
		);
		// Let the field's listeners attach before the test uses it.
		await act(async () => {});
	}
	return current;
}

const field = () => document.querySelector("math-field") as Field;
const type = (el: Field, latex: string) =>
	act(() => {
		el.value = latex;
		el.dispatchEvent(new Event("input"));
	});
const latexIn = (editor: Editor, index = 0) =>
	(
		docToBlocks(editor.getJSON())[index]?.attrs as
			| { latex?: string }
			| undefined
	)?.latex;
const types = (editor: Editor) =>
	editor.getJSON().content?.map((node) => node.type);

beforeEach(() => {
	current = null;
});
afterEach(() => {
	cleanup();
});

it("is in the slash menu as Math block, found by math, equation, formula, latex and fraction", async () => {
	const item = SLASH_ITEMS.find((i) => i.id === "math");
	expect(item?.label).toBe("Math block");
	expect(item?.section).toBe("Blocks");
	const { filterSlashItems } = await import("./slash-items");
	for (const query of ["math", "equation", "formula", "latex", "fraction"]) {
		expect(filterSlashItems(query).map((i) => i.id)).toContain("math");
	}
});

it("inserts an empty block from the slash menu and starts in edit mode", async () => {
	const editor = await open(para("p", "/"));
	const item = SLASH_ITEMS.find((i) => i.id === "math");
	act(() => item?.run(editor, { from: 1, to: 2 }));
	await waitFor(() =>
		expect(document.querySelector("math-field")).toBeTruthy(),
	);
	expect(types(editor)).toEqual(["mathBlock", "paragraph"]);
	expect(field().dataset.focused).toBe("true");
	// Nothing is written for an empty block's attributes.
	expect(docToBlocks(editor.getJSON())[0]?.attrs).toBeUndefined();
});

it("saves what is typed as LaTeX and shows the same equation on reopening", async () => {
	const editor = await open(math(), para("p", "after"));
	type(field(), "\\frac{a}{b}=\\sqrt{x^2+1}");
	expect(latexIn(editor)).toBe("\\frac{a}{b}=\\sqrt{x^2+1}");

	const saved = docToBlocks(editor.getJSON());
	cleanup();
	current = null;
	render(<Harness content={blocksToDoc(saved)} />);
	await waitFor(() =>
		expect(document.querySelector("math-field")).toBeTruthy(),
	);
	expect(field().value).toBe("\\frac{a}{b}=\\sqrt{x^2+1}");
});

it("sets the library up with no fonts, sounds or compute engine to fetch, and the keyboard on auto", async () => {
	await open(math("x"));
	const { MathfieldElement } = await import("mathlive");
	expect(MathfieldElement.fontsDirectory).toBeNull();
	expect(MathfieldElement.soundsDirectory).toBeNull();
	expect(MathfieldElement.keypressSound).toBeNull();
	expect(MathfieldElement.plonkSound).toBeNull();
	expect(MathfieldElement.computeEngine).toBeNull();
	expect(field().mathVirtualKeyboardPolicy).toBe("auto");
});

it("takes a missing, empty or non-text value as empty, and rewrites it on the next edit", async () => {
	for (const bad of [undefined, "", 42, null, { a: 1 }]) {
		const editor = await open(math(bad));
		expect(field().value).toBe(latexOf(bad));
		expect(field().value).toBe("");
		// Opening changes nothing.
		cleanup();
		current = null;
		expect(editor).toBeTruthy();
	}
	const editor = await open(math(42));
	type(field(), "x");
	expect(latexIn(editor)).toBe("x");
});

it("shows the equation in a read-only note and does not let it be edited", async () => {
	const editor = await open(math("x^2"));
	expect(field().readOnly).toBe(false);
	act(() => {
		editor.setEditable(false);
	});
	await waitFor(() => expect(field().readOnly).toBe(true));
	expect(field().value).toBe("x^2");
	expect(
		document.querySelector(".math-block")?.getAttribute("data-selected"),
	).toBeNull();
});

it("removes an empty block on Backspace and puts the caret in the block above", async () => {
	const editor = await open(para("a", "above"), math(), para("b", "below"));
	act(() => {
		field().dispatchEvent(
			new KeyboardEvent("keydown", { key: "Backspace", bubbles: true }),
		);
	});
	expect(types(editor)).toEqual(["paragraph", "paragraph"]);
	const { $from } = editor.state.selection;
	expect($from.parent.textContent).toBe("above");
});

it("does not remove a block that has an equation on Backspace", async () => {
	const editor = await open(math("x"));
	act(() => {
		field().dispatchEvent(
			new KeyboardEvent("keydown", { key: "Backspace", bubbles: true }),
		);
	});
	expect(types(editor)).toEqual(["mathBlock"]);
});

it("leaves on Escape and on moving out with the arrow keys", async () => {
	const editor = await open(para("a", "above"), math("x"), para("b", "below"));
	act(() => {
		field().dispatchEvent(
			new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
		);
	});
	expect(editor.state.selection.$from.parent.textContent).toBe("below");

	const moveOut = (direction: string) =>
		act(() => {
			field().dispatchEvent(
				new CustomEvent("move-out", {
					detail: { direction },
					cancelable: true,
				}),
			);
		});
	moveOut("upward");
	expect(editor.state.selection.$from.parent.textContent).toBe("above");
	moveOut("forward");
	expect(editor.state.selection.$from.parent.textContent).toBe("below");
});

it("gives the caret somewhere to go when a math block is last and is left", async () => {
	const editor = await open(math("x"));
	act(() => {
		field().dispatchEvent(
			new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
		);
	});
	expect(types(editor)).toEqual(["mathBlock", "paragraph"]);
	expect(editor.state.selection.$from.parent.type.name).toBe("paragraph");
});

it("undoes and redoes an edit like any other block, and the field follows", async () => {
	const editor = await open(math("a"));
	type(field(), "a+b");
	expect(latexIn(editor)).toBe("a+b");
	act(() => {
		editor.commands.undo();
	});
	await waitFor(() => expect(field().value).toBe("a"));
	expect(latexIn(editor)).toBe("a");
	act(() => {
		editor.commands.redo();
	});
	await waitFor(() => expect(field().value).toBe("a+b"));
});

it("copies as its LaTeX in plain text, and a copied block keeps its equation", async () => {
	const editor = await open(math("\\frac{1}{2}"));
	expect(editor.getText()).toContain("\\frac{1}{2}");
	const html = editor.getHTML();
	expect(html).toContain('data-type="math-block"');
	// Pasting that HTML back makes the same block.
	act(() => {
		editor.commands.setContent(html);
	});
	await waitFor(() => expect(field().value).toBe("\\frac{1}{2}"));
	expect(latexIn(editor)).toBe("\\frac{1}{2}");
});

it("never cuts a very long value: it shows the start as text and keeps all of it", async () => {
	const long = `x+${"1+".repeat(MATH_SHOW_LIMIT)}1`;
	render(
		<Harness
			content={{ type: "doc", content: [math(long), para("p", "x")] }}
		/>,
	);
	const editor = current as Editor | null;
	if (!editor) throw new Error("editor did not start");
	expect(document.querySelector("math-field")).toBeNull();
	expect(document.querySelector(".math-source")).toBeTruthy();
	expect(document.querySelector(".math-source code")?.textContent).toHaveLength(
		200,
	);
	expect(latexIn(editor)).toBe(long);
});

it("counts the LaTeX as the block's text for previews and search", () => {
	const blocks = [
		{
			id: "p",
			type: "paragraph",
			parent: null,
			content: [{ type: "text", text: "Area" }],
		},
		{
			id: "m",
			type: "mathBlock",
			parent: null,
			attrs: { latex: "\\pi r^2" },
		},
		{ id: "e", type: "mathBlock", parent: null },
	];
	expect(previewOf(blocks)).toBe("Area \\pi r^2");
	expect(searchTextOf(blocks)).toContain("\\pi r^2");
	expect(searchTextOf(blocks)).toContain("Area");
});
