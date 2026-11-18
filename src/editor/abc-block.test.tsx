// @vitest-environment happy-dom

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { type Editor, EditorContent, useEditor } from "@tiptap/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { describeAbcWarning, guitarTabs } from "./abc-block";
import { createExtensions } from "./extensions";
import { hiddenSources } from "./mermaid-block";

const loaded = vi.hoisted(() => ({
	count: 0,
	lastParams: null as Record<string, unknown> | null,
}));

vi.mock("abcjs", () => {
	loaded.count++;
	return {
		renderAbc: vi.fn(
			(el: HTMLElement, text: string, params: Record<string, unknown> = {}) => {
				loaded.lastParams = params;
				const mode = Array.isArray(params.tablature) ? "tab" : "staff";
				el.innerHTML = `<svg data-text="${text.length}" data-mode="${mode}"></svg>`;
				const warnings = text.includes("oops")
					? ["Music Line:2:5: Unknown character ignored:  C D <span>o</span>"]
					: undefined;
				return [{ warnings }];
			},
		),
	};
});

let current: Editor | null = null;

function Harness({ content }: { content: object }) {
	current = useEditor({ extensions: createExtensions(), content });
	return <EditorContent editor={current} />;
}

function open(blocks: object[]): Editor {
	render(<Harness content={{ type: "doc", content: blocks }} />);
	if (!current) throw new Error("editor did not start");
	return current;
}

const code = (text: string, language: string | null = null) => ({
	type: "codeBlock",
	attrs: { id: "a", language },
	content: [{ type: "text", text }],
});

const svg = () => document.querySelector(".abc-svg svg");

beforeEach(() => {
	vi.stubGlobal("IntersectionObserver", undefined);
	localStorage.clear();
});

afterEach(() => {
	cleanup();
	current = null;
	vi.unstubAllGlobals();
});

it("does not load abcjs for a note without sheet music blocks", async () => {
	open([code("let a = 1;", "javascript"), { type: "paragraph" }]);
	await new Promise((done) => setTimeout(done, 50));
	expect(document.querySelector(".abc-block")).toBeNull();
	expect(loaded.count).toBe(0);
});

it("draws the sheet music beside the text once the language is abc", async () => {
	const editor = open([code("X:1\nK:C\nC D E F |")]);
	expect(document.querySelector(".abc-block")).toBeNull();
	act(() => {
		editor.commands.updateAttributes("codeBlock", { language: "abc" });
	});
	expect(document.querySelector(".abc-block pre code")?.textContent).toContain(
		"C D E F |",
	);
	await vi.waitFor(() => expect(svg()).not.toBeNull());
	expect(loaded.count).toBe(1);
	expect(loaded.lastParams).toMatchObject({
		responsive: "resize",
		foregroundColor: "currentColor",
	});
});

it("keeps the last good drawing, dimmed, and shows a plain message on error", async () => {
	const editor = open([code("X:1\nK:C\nC D E F |", "abc")]);
	await vi.waitFor(() => expect(svg()).not.toBeNull());
	const good = svg()?.getAttribute("data-text");
	act(() => {
		editor.commands.insertContentAt(editor.state.doc.content.size - 1, " oops");
	});
	const message = document.querySelector(".mermaid-error");
	await vi.waitFor(() =>
		expect(message?.textContent).toBe("Line 2: unknown character ignored"),
	);
	expect(svg()?.getAttribute("data-text")).toBe(good);
	expect(document.querySelector(".abc-svg")?.hasAttribute("data-stale")).toBe(
		true,
	);
	expect(message?.textContent).not.toMatch(/<span|at |Error/);
	expect(describeAbcWarning("")).toBe("The music text can't be read");
});

it("toggles guitar tab and source visibility in UI memory without changing the note", async () => {
	const editor = open([code("X:1\nK:C\nC D E F |", "abc")]);
	await vi.waitFor(() =>
		expect(svg()?.getAttribute("data-mode")).toBe("staff"),
	);
	const before = JSON.stringify(editor.getJSON());
	const block = document.querySelector<HTMLElement>(".abc-block");
	const [tabBtn, sourceBtn] = document.querySelectorAll<HTMLButtonElement>(
		".abc-controls .mermaid-toggle",
	);

	fireEvent.click(tabBtn as HTMLButtonElement);
	await vi.waitFor(() => expect(svg()?.getAttribute("data-mode")).toBe("tab"));
	expect(loaded.lastParams?.tablature).toEqual([{ instrument: "guitar" }]);
	expect(tabBtn?.getAttribute("aria-pressed")).toBe("true");
	expect(guitarTabs()).toEqual(["a"]);

	fireEvent.click(sourceBtn as HTMLButtonElement);
	expect(block?.dataset.source).toBe("hidden");
	expect(hiddenSources()).toEqual(["a"]);
	expect(JSON.stringify(editor.getJSON())).toBe(before);
});

it("never imports abcjs synth or audio CSS anywhere in src/", () => {
	const walk = (dir: string): string[] =>
		readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
			entry.isDirectory()
				? walk(join(dir, entry.name))
				: [join(dir, entry.name)],
		);
	for (const file of walk("src")) {
		if (file.endsWith("abc-block.test.tsx")) continue;
		expect(readFileSync(file, "utf8")).not.toMatch(
			/abcjs\/synth|abcjs\.synth|abcjs-audio\.css/,
		);
	}
});
