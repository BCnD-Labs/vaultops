// @vitest-environment happy-dom
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, expect, it } from "vitest";
import { WordComplete } from "./word-complete";

let editor: Editor;
afterEach(() => {
	editor?.destroy();
	document.body.replaceChildren();
});
async function type(text: string, code = false) {
	editor = new Editor({
		element: document.createElement("div"),
		extensions: [
			StarterKit,
			WordComplete.configure({
				rows: () => [{ path: "a", title: "", text: "completion" }],
			}),
		],
		content: code ? "<pre><code></code></pre>" : "<p></p>",
	});
	editor.commands.insertContent(text);
	await new Promise((resolve) => setTimeout(resolve, 0));
}
it("shows suggestions and Tab inserts only the suffix", async () => {
	await type("com");
	expect(document.querySelector(".slash-menu-label")?.textContent).toBe(
		"completion",
	);
	editor.view.someProp("handleKeyDown", (handler) =>
		handler(editor.view, new KeyboardEvent("keydown", { key: "Tab" })),
	);
	expect(editor.getText()).toBe("completion");
});
const press = (key: string) =>
	editor.view.someProp("handleKeyDown", (handler) =>
		handler(editor.view, new KeyboardEvent("keydown", { key })),
	);
it("leaves Enter to the editor until the arrows pick a suggestion", async () => {
	await type("com");
	press("Enter");
	expect(editor.getText()).not.toContain("completion");
});
it("accepts with Enter after an arrow key", async () => {
	await type("com");
	press("ArrowDown");
	press("Enter");
	expect(editor.getText()).toBe("completion");
});
it("does not open in code or after another menu trigger", async () => {
	await type("com", true);
	expect(document.querySelector(".word-complete")).toBeNull();
});
