// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { type Editor, EditorContent, useEditor } from "@tiptap/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createExtensions } from "./extensions";
import { hiddenSources } from "./mermaid-block";

const loaded = vi.hoisted(() => ({ count: 0 }));

vi.mock("mermaid", () => {
	loaded.count++;
	return {
		default: {
			initialize: vi.fn(),
			detectType: () => "flowchart",
			mermaidAPI: { getConfig: () => ({}) },
			render: vi.fn(async (_id: string, text: string) => {
				if (text.includes("oops")) {
					throw Object.assign(new Error("Parse error on line 2:\n..."), {
						hash: { text: "oops", token: "ALPHA", loc: { first_line: 2 } },
					});
				}
				return { svg: `<svg data-text="${text.length}"></svg>` };
			}),
		},
	};
});

let current: Editor | null = null;

function Harness({ content }: { content: object }) {
	const editor = useEditor({ extensions: createExtensions(), content });
	current = editor;
	return <EditorContent editor={editor} />;
}

function open(blocks: object[]): Editor {
	render(<Harness content={{ type: "doc", content: blocks }} />);
	if (!current) throw new Error("editor did not start");
	return current;
}

const code = (text: string, language: string | null = null) => ({
	type: "codeBlock",
	attrs: { id: "m", language },
	content: [{ type: "text", text }],
});

const svg = () => document.querySelector(".mermaid-svg svg");

beforeEach(() => {
	// No layout here: every diagram counts as on screen at once.
	vi.stubGlobal("IntersectionObserver", undefined);
	localStorage.clear();
});

afterEach(() => {
	cleanup();
	current = null;
	vi.unstubAllGlobals();
});

it("does not load Mermaid for a note without diagrams", async () => {
	open([code("let a = 1;", "javascript"), { type: "paragraph" }]);
	await new Promise((done) => setTimeout(done, 50));
	expect(document.querySelector(".mermaid-block")).toBeNull();
	expect(loaded.count).toBe(0);
});

it("draws the diagram beside the text once the language is mermaid", async () => {
	const editor = open([code("flowchart TD\nA --> B")]);
	expect(document.querySelector(".mermaid-block")).toBeNull();
	act(() => {
		editor.commands.updateAttributes("codeBlock", { language: "mermaid" });
	});
	const block = document.querySelector(".mermaid-block");
	expect(block?.querySelector("pre code")?.textContent).toContain("A --> B");
	await vi.waitFor(() => expect(svg()).not.toBeNull());
	expect(loaded.count).toBe(1);
});

it("keeps the last good diagram, dimmed, and says what is wrong in plain words", async () => {
	const editor = open([code("flowchart TD\nA --> B", "mermaid")]);
	await vi.waitFor(() => expect(svg()).not.toBeNull());
	const good = svg()?.getAttribute("data-text");
	act(() => {
		editor.commands.insertContentAt(editor.state.doc.content.size - 1, " oops");
	});
	const message = document.querySelector(".mermaid-error");
	await vi.waitFor(() =>
		expect(message?.textContent).toBe("Line 2: didn't expect “oops”"),
	);
	expect(svg()?.getAttribute("data-text")).toBe(good);
	expect(
		document.querySelector(".mermaid-svg")?.hasAttribute("data-stale"),
	).toBe(true);
	expect(message?.textContent).not.toMatch(/at |Error/);
});

it("hides the text without changing the saved block, and remembers it", async () => {
	const editor = open([code("flowchart TD\nA --> B", "mermaid")]);
	const before = JSON.stringify(editor.getJSON());
	const block = document.querySelector<HTMLElement>(".mermaid-block");
	const toggle = document.querySelector<HTMLButtonElement>(".mermaid-toggle");
	expect(block?.dataset.source).toBe("shown");
	fireEvent.click(toggle as HTMLButtonElement);
	expect(block?.dataset.source).toBe("hidden");
	expect(toggle?.getAttribute("aria-pressed")).toBe("true");
	expect(JSON.stringify(editor.getJSON())).toBe(before);
	expect(hiddenSources()).toEqual(["m"]);

	cleanup();
	open([code("flowchart TD\nA --> B", "mermaid")]);
	expect(
		document.querySelector<HTMLElement>(".mermaid-block")?.dataset.source,
	).toBe("hidden");
});
