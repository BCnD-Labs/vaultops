// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { type Editor, EditorContent, useEditor } from "@tiptap/react";
import { afterEach, expect, it } from "vitest";
import {
	applyInterface,
	type InterfacePrefs,
	loadInterface,
} from "../ui/appearance";
import { codeLines, lineDigits, wrapOf } from "./code-language";
import { blocksToDoc, docToBlocks } from "./doc-blocks";
import { createExtensions } from "./extensions";

let current: Editor | null = null;

function Harness({ content }: { content: object }) {
	const editor = useEditor({ extensions: createExtensions(), content });
	current = editor;
	return <EditorContent editor={editor} />;
}

function open(code: string, attrs: object = {}): Editor {
	render(
		<Harness
			content={{
				type: "doc",
				content: [
					{
						type: "codeBlock",
						attrs: { id: "c", ...attrs },
						content: code ? [{ type: "text", text: code }] : undefined,
					},
				],
			}}
		/>,
	);
	if (!current) throw new Error("editor did not start");
	return current;
}

afterEach(() => {
	cleanup();
	current = null;
	document.documentElement.removeAttribute("data-hide-code-numbers");
	document.documentElement.removeAttribute("data-hide-code-wrap");
});

const numbers = () =>
	Array.from(document.querySelectorAll<HTMLElement>(".code-ln")).map(
		(n) => n.dataset.line,
	);

it("numbers each real line, including empty ones, and an empty block has one", () => {
	open("one\n\nthree");
	expect(numbers()).toEqual(["1", "2", "3"]);
	cleanup();
	open("");
	expect(numbers()).toEqual(["1"]);
});

it("gives a line one number however long it is, and renumbers as lines are added", () => {
	const editor = open("a very long line ".repeat(40), { wrap: true });
	expect(numbers()).toEqual(["1"]);
	act(() => {
		editor.commands.insertContentAt(2, "\nsecond");
	});
	expect(numbers()).toEqual(["1", "2"]);
});

it("makes the gutter wide enough for the biggest line number", () => {
	open(Array.from({ length: 120 }, (_, i) => `line ${i}`).join("\n"));
	const pre = document.querySelector("pre");
	expect(pre?.getAttribute("style")).toContain("--code-digits: 3");
	expect(lineDigits(9)).toBe(1);
	expect(lineDigits(10)).toBe(2);
	expect(lineDigits(0)).toBe(1);
	expect(codeLines("a\nb")).toEqual(["a", "b"]);
});

it("keeps the numbers out of the code: the text and the copy are only the code", () => {
	const editor = open("one\ntwo");
	expect(editor.getText()).toBe("one\ntwo");
	expect(editor.state.doc.textContent).toBe("one\ntwo");
	let copied = "";
	Object.defineProperty(navigator, "clipboard", {
		configurable: true,
		value: {
			writeText: async (text: string) => {
				copied = text;
			},
		},
	});
	act(() => {
		fireEvent.click(document.querySelector(".code-copy") as HTMLElement);
	});
	expect(copied).toBe("one\ntwo");
	// The numbers are not editable text and are hidden from screen readers.
	const first = document.querySelector<HTMLElement>(".code-ln");
	expect(first?.textContent).toBe("");
	expect(first?.getAttribute("aria-hidden")).toBe("true");
	expect(first?.contentEditable).toBe("false");
});

it("wraps from the block's Wrap button, and the choice is stored with the block", () => {
	const editor = open("long line");
	const pre = () => document.querySelector("pre");
	const button = () =>
		document.querySelector<HTMLButtonElement>(".code-wrap") as HTMLElement;
	expect(pre()?.getAttribute("data-wrap")).toBeNull();
	expect(button().getAttribute("aria-pressed")).toBe("false");
	// A new block does not wrap, and writes nothing for it.
	expect(docToBlocks(editor.getJSON())[0]?.attrs).toBeUndefined();

	act(() => {
		fireEvent.click(button());
	});
	expect(pre()?.getAttribute("data-wrap")).toBe("true");
	expect(button().getAttribute("aria-pressed")).toBe("true");
	const saved = docToBlocks(editor.getJSON());
	expect(saved[0]?.attrs).toEqual({ wrap: true });

	// Reopening the note shows it wrapped.
	cleanup();
	render(<Harness content={blocksToDoc(saved)} />);
	expect(document.querySelector("pre")?.getAttribute("data-wrap")).toBe("true");

	act(() => {
		fireEvent.click(button());
	});
	expect(docToBlocks(current?.getJSON() ?? { type: "doc" })[0]?.attrs).toBe(
		undefined,
	);
});

it("lets the text be wrapped by a read-only note but not changed there", () => {
	const editor = open("long line", { wrap: true });
	act(() => {
		editor.setEditable(false);
	});
	expect(document.querySelector("pre")?.getAttribute("data-wrap")).toBe("true");
	expect(document.querySelector(".code-wrap")).toBeNull();
	expect(numbers()).toEqual(["1"]);
});

it("reads only true as wrap", () => {
	expect(wrapOf(true)).toBe(true);
	for (const value of [false, "true", 1, null, undefined]) {
		expect(wrapOf(value)).toBe(false);
	}
});

const prefs = (over: Partial<InterfacePrefs> = {}): InterfacePrefs => ({
	...loadInterface({ getItem: () => null }),
	...over,
});

it("turns the line numbers and the wrap option off and on from Settings", () => {
	const root = document.documentElement;
	const read = (blob: object) =>
		loadInterface({ getItem: () => JSON.stringify(blob) });
	// Both are on until switched off.
	expect(loadInterface({ getItem: () => null })).toMatchObject({
		codeLineNumbers: true,
		codeWrapOption: true,
	});
	expect(read({ "editor.codeLineNumbers": false })).toMatchObject({
		codeLineNumbers: false,
		codeWrapOption: true,
	});
	expect(read({ "editor.codeWrapOption": false })).toMatchObject({
		codeLineNumbers: true,
		codeWrapOption: false,
	});

	applyInterface(
		root,
		prefs({ codeLineNumbers: false, codeWrapOption: false }),
	);
	expect(root.hasAttribute("data-hide-code-numbers")).toBe(true);
	expect(root.hasAttribute("data-hide-code-wrap")).toBe(true);
	applyInterface(root, prefs());
	expect(root.hasAttribute("data-hide-code-numbers")).toBe(false);
	expect(root.hasAttribute("data-hide-code-wrap")).toBe(false);
});

it("keeps a block's saved wrap and its numbers in the note while the settings are off", () => {
	const editor = open("one\ntwo", { wrap: true });
	applyInterface(
		document.documentElement,
		prefs({ codeLineNumbers: false, codeWrapOption: false }),
	);
	// The setting only hides things on screen: the stored choice is untouched.
	expect(docToBlocks(editor.getJSON())[0]?.attrs).toEqual({ wrap: true });
	expect(document.querySelector("pre")?.getAttribute("data-wrap")).toBe("true");
	applyInterface(document.documentElement, prefs());
	expect(docToBlocks(editor.getJSON())[0]?.attrs).toEqual({ wrap: true });
});

// ---- Line highlight ----

const lineNumber = (n: number) =>
	document.querySelector<HTMLElement>(
		`.code-ln[data-line="${n}"]`,
	) as HTMLElement;
const lit = () =>
	Array.from(document.querySelectorAll<HTMLElement>(".code-ln[data-hl]")).map(
		(n) => n.dataset.line,
	);
const stored = (editor: Editor) =>
	(
		docToBlocks(editor.getJSON())[0]?.attrs as
			| { highlight?: string }
			| undefined
	)?.highlight;
const five = "one\ntwo\nthree\nfour\nfive";

it("highlights a line when its number is clicked, and clears it when clicked again", () => {
	const editor = open(five);
	expect(lit()).toEqual([]);
	act(() => {
		fireEvent.click(lineNumber(2));
	});
	expect(lit()).toEqual(["2"]);
	expect(stored(editor)).toBe("2");
	// The text of the line is marked too, and the code itself is unchanged.
	expect(document.querySelector(".code-hl")?.textContent).toBe("two");
	expect(editor.state.doc.textContent).toBe(five);
	act(() => {
		fireEvent.click(lineNumber(2));
	});
	expect(lit()).toEqual([]);
	// Nothing is written for a block with no highlighted line.
	expect(docToBlocks(editor.getJSON())[0]?.attrs).toBeUndefined();
});

it("extends over a range on shift-click, from the last line clicked", () => {
	const editor = open(five);
	act(() => {
		fireEvent.click(lineNumber(2));
	});
	act(() => {
		fireEvent.click(lineNumber(4), { shiftKey: true });
	});
	expect(lit()).toEqual(["2", "3", "4"]);
	expect(stored(editor)).toBe("2-4");
	act(() => {
		fireEvent.click(lineNumber(5));
	});
	expect(stored(editor)).toBe("2-5");
	act(() => {
		fireEvent.click(lineNumber(3));
	});
	expect(stored(editor)).toBe("2,4-5");
});

it("treats a shift-click with no line clicked before as an ordinary click", () => {
	const editor = open(five);
	act(() => {
		fireEvent.click(lineNumber(3), { shiftKey: true });
	});
	expect(stored(editor)).toBe("3");
});

it("undoes and redoes a highlight like any other change", () => {
	const editor = open(five);
	act(() => {
		fireEvent.click(lineNumber(1));
	});
	expect(stored(editor)).toBe("1");
	act(() => {
		editor.commands.undo();
	});
	expect(stored(editor)).toBeUndefined();
	act(() => {
		editor.commands.redo();
	});
	expect(stored(editor)).toBe("1");
});

it("shows saved highlights on reopening, and in a note that is read-only", () => {
	const editor = open(five, { highlight: "2,4-5" });
	expect(lit()).toEqual(["2", "4", "5"]);
	act(() => {
		editor.setEditable(false);
	});
	expect(lit()).toEqual(["2", "4", "5"]);
	// The numbers are not buttons any more, so nothing can be changed.
	expect(document.querySelector(".code-ln[data-edit]")).toBeNull();
	act(() => {
		fireEvent.click(lineNumber(1));
	});
	expect(stored(editor)).toBe("2,4-5");
});

it("drops highlighted lines the code no longer has, as part of the edit", () => {
	// A highlight past the end does not show or break anything.
	open("only", { highlight: "3" });
	expect(lit()).toEqual([]);
	cleanup();

	const again = open(five, { highlight: "2,4-5" });
	act(() => {
		again.commands.setTextSelection({ from: 8, to: 24 });
		again.commands.deleteSelection();
	});
	expect(again.state.doc.textContent).toBe("one\ntwo");
	expect(stored(again)).toBe("2");
	act(() => {
		again.commands.undo();
	});
	expect(again.state.doc.textContent).toBe(five);
	expect(stored(again)).toBe("2,4-5");
});

it("shows a stored value that does not parse as no highlight, and rewrites it on the next edit", () => {
	const editor = open(five, { highlight: "x-y" });
	expect(lit()).toEqual([]);
	// Opening the note changes nothing in it.
	expect(stored(editor)).toBe("x-y");
	act(() => {
		editor.commands.insertContentAt(1, "!");
	});
	expect(stored(editor)).toBeUndefined();
});

it("hides highlights and ignores the number click while the setting is off, keeping them", () => {
	const editor = open(five, { highlight: "2" });
	const root = document.documentElement;
	applyInterface(root, prefs({ codeLineHighlight: false }));
	expect(root.hasAttribute("data-hide-code-highlight")).toBe(true);
	act(() => {
		fireEvent.click(lineNumber(4));
	});
	expect(stored(editor)).toBe("2");
	applyInterface(root, prefs());
	expect(root.hasAttribute("data-hide-code-highlight")).toBe(false);
	act(() => {
		fireEvent.click(lineNumber(4));
	});
	expect(stored(editor)).toBe("2,4");
	expect(
		loadInterface({
			getItem: () => JSON.stringify({ "editor.codeLineHighlight": false }),
		}).codeLineHighlight,
	).toBe(false);
	expect(loadInterface({ getItem: () => null }).codeLineHighlight).toBe(true);
	root.removeAttribute("data-hide-code-highlight");
});

it("still lets a line be highlighted with the line numbers turned off", () => {
	const editor = open(five);
	applyInterface(document.documentElement, prefs({ codeLineNumbers: false }));
	act(() => {
		fireEvent.click(lineNumber(3));
	});
	expect(stored(editor)).toBe("3");
});
