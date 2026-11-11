// @vitest-environment happy-dom
import { act, cleanup, render, screen } from "@testing-library/react";
import { type Editor, EditorContent, useEditor } from "@tiptap/react";
import { useEffect } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { searchTargets } from "../core/links/links";
import { createExtensions } from "./extensions";
import { type LinkSource, setLinkSource } from "./note-link";

const TARGETS = [
	{ kind: "note", target: "n1", label: "Trip plan" },
	{ kind: "canvas", target: "c1", label: "Ideas" },
	{ kind: "resource", target: "r1", label: "Sam Rivera" },
] as const;

function source(open = vi.fn()): LinkSource {
	return {
		search: (query, scope) => searchTargets([...TARGETS], query, scope),
		describe: (kind, target) =>
			TARGETS.find((t) => t.kind === kind && t.target === target)?.label ??
			null,
		open,
	};
}

let current: Editor | null = null;
function Harness({
	links,
	self,
	content,
}: {
	links?: LinkSource;
	self?: string;
	content?: object;
}) {
	const editor = useEditor({
		extensions: createExtensions(),
		content: (content as never) ?? {
			type: "doc",
			content: [{ type: "paragraph", attrs: { id: "a" } }],
		},
	});
	current = editor;
	useEffect(() => {
		if (editor && !editor.isDestroyed)
			setLinkSource(editor, links ?? null, self ?? null);
	}, [editor, links, self]);
	return <EditorContent editor={editor} />;
}
afterEach(() => {
	cleanup();
	current = null;
	document.body.replaceChildren();
});
let again: (links?: LinkSource, self?: string) => void = () => {};
function open(links?: LinkSource, self?: string, content?: object): Editor {
	const view = render(<Harness links={links} self={self} content={content} />);
	again = (next, nextSelf) =>
		view.rerender(<Harness links={next} self={nextSelf} content={content} />);
	if (!current) throw new Error("no editor");
	return current;
}
const settle = () =>
	act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 0));
	});
const insert = (editor: Editor, text: string) =>
	act(async () => {
		editor.commands.insertContent(text);
		await new Promise((resolve) => setTimeout(resolve, 0));
	});
const labels = () =>
	[...document.querySelectorAll(".slash-menu-label")].map((l) => l.textContent);
const sections = () =>
	[...document.querySelectorAll(".slash-menu-section")].map(
		(l) => l.textContent,
	);
const pick = (id: string) =>
	act(async () => {
		document
			.querySelector<HTMLElement>(`.slash-menu-item[data-id="${id}"]`)
			?.dispatchEvent(
				new MouseEvent("mousedown", { bubbles: true, cancelable: true }),
			);
	});

it("[[ lists notes, canvases and resources in groups, and filters as you type", async () => {
	const editor = open(source());
	await insert(editor, "[[");
	expect(sections()).toEqual(["Notes", "Canvases", "Resources"]);
	expect(labels()).toEqual(["Trip plan", "Ideas", "Sam Rivera"]);
	await insert(editor, "sam");
	expect(labels()).toEqual(["Sam Rivera"]);
});

it("@ lists resources only", async () => {
	const editor = open(source());
	await insert(editor, "@");
	expect(sections()).toEqual(["Resources"]);
	expect(labels()).toEqual(["Sam Rivera"]);
});

it("@ inside a word (an email address) does nothing", async () => {
	const editor = open(source());
	await insert(editor, "me@");
	expect(document.querySelector(".slash-menu")).toBeNull();
});

it("choosing removes the typed text and leaves a link and a space", async () => {
	const editor = open(source());
	await insert(editor, "see [[sam");
	await pick("resource:r1");
	const para = editor.getJSON().content?.[0];
	expect(para?.content).toEqual([
		{ type: "text", text: "see " },
		{
			type: "noteLink",
			attrs: { kind: "resource", target: "r1", label: "Sam Rivera" },
		},
		{ type: "text", text: " " },
	]);
	expect(document.querySelector(".slash-menu")).toBeNull();
});

it("shows the target's current name, and marks one that is gone", async () => {
	const editor = open(source());
	await act(async () => {
		editor.commands.insertContent([
			{
				type: "noteLink",
				attrs: { kind: "note", target: "n1", label: "Old name" },
			},
			{
				type: "noteLink",
				attrs: { kind: "note", target: "gone", label: "Deleted note" },
			},
		]);
		await new Promise((resolve) => setTimeout(resolve, 0));
	});
	const chips = [...document.querySelectorAll<HTMLElement>(".note-link-chip")];
	expect(chips.map((c) => c.textContent)).toEqual([
		"Trip plan",
		"Deleted note",
	]);
	expect(chips.map((c) => c.dataset.missing)).toEqual([undefined, "true"]);
});

it("clicking a link asks the app to open it", async () => {
	const openLink = vi.fn();
	const editor = open(source(openLink));
	await act(async () => {
		editor.commands.insertContent({
			type: "noteLink",
			attrs: { kind: "canvas", target: "c1", label: "Ideas" },
		});
		await new Promise((resolve) => setTimeout(resolve, 0));
	});
	document.querySelector<HTMLElement>(".note-link-chip")?.click();
	expect(openLink).toHaveBeenCalledWith({
		kind: "canvas",
		target: "c1",
		label: "Ideas",
	});
});

it("without a source the pickers stay shut and the slash menu has no link items", async () => {
	const editor = open();
	await insert(editor, "[[");
	expect(document.querySelector(".slash-menu")).toBeNull();
	await insert(editor, "@");
	expect(document.querySelector(".slash-menu")).toBeNull();
	await act(async () => {
		editor.commands.clearContent();
	});
	await insert(editor, "/");
	expect(labels()).not.toContain("Link");
	expect(labels()).not.toContain("Mention a resource");
});

it("the slash menu's Link item opens the picker", async () => {
	const editor = open(source());
	await insert(editor, "/link");
	await pick("link");
	await act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 0));
	});
	expect(labels()).toEqual(["Trip plan", "Ideas", "Sam Rivera"]);
});

it("is not offered in a read-only note", async () => {
	const editor = open(source());
	editor.setEditable(false);
	await insert(editor, "[[");
	expect(document.querySelector(".slash-menu")).toBeNull();
});

const chipText = () =>
	[...document.querySelectorAll(".note-link-chip")].map((c) => c.textContent);
const linkDoc = (target: string, label = "Gone name") => ({
	type: "doc",
	content: [
		{
			type: "paragraph",
			attrs: { id: "a" },
			content: [
				{ type: "text", text: "see " },
				{ type: "noteLink", attrs: { kind: "note", target, label } },
				{ type: "text", text: " now" },
			],
		},
	],
});

it("a link in an open note follows the app's list: a rename shows, a trashed target is marked", async () => {
	const first = source();
	open(first, undefined, linkDoc("n1", "Old"));
	await settle();
	expect(chipText()).toEqual(["Trip plan"]);
	// The note was renamed.
	again({
		...first,
		describe: (kind, target) => (target === "n1" ? "Trip plan 2" : null),
	});
	await settle();
	expect(chipText()).toEqual(["Trip plan 2"]);
	expect(
		document.querySelector<HTMLElement>(".note-link-chip")?.dataset.missing,
	).toBeUndefined();
	// The note was trashed.
	again({ ...first, describe: () => null });
	await settle();
	expect(
		document.querySelector<HTMLElement>(".note-link-chip")?.dataset.missing,
	).toBe("true");
});

it("clicking a gone link offers to keep its name as text or remove it", async () => {
	const openLink = vi.fn();
	const editor = open(
		{ ...source(openLink), describe: () => null },
		undefined,
		linkDoc("gone"),
	);
	await settle();
	document.querySelector<HTMLElement>(".note-link-chip")?.click();
	await settle();
	expect(openLink).not.toHaveBeenCalled();
	expect(screen.getByText("No longer in this vault.")).toBeTruthy();
	screen.getByRole("button", { name: "Keep the name as text" }).click();
	await settle();
	expect(editor.getText()).toContain("see Gone name now");
	expect(document.querySelector(".note-link-chip")).toBeNull();
});

it("a gone link can be removed", async () => {
	const editor = open(
		{ ...source(), describe: () => null },
		undefined,
		linkDoc("gone"),
	);
	await settle();
	document.querySelector<HTMLElement>(".note-link-chip")?.click();
	await settle();
	screen.getByRole("button", { name: "Remove link" }).click();
	await settle();
	expect(editor.getText()).toBe("see  now");
});

it("@ keeps listening across a space, so a full name is found", async () => {
	const editor = open(source());
	await insert(editor, "@Sam");
	expect(labels()).toEqual(["Sam Rivera"]);
	await insert(editor, " Riv");
	expect(labels()).toEqual(["Sam Rivera"]);
	await pick("resource:r1");
	expect(editor.getText()).toBe("Sam Rivera ");
});

it("@ followed by words that are no name stays out of the way", async () => {
	const editor = open(source());
	await insert(editor, "meet @ five o'clock");
	const menu = document.querySelector<HTMLElement>(".slash-menu");
	expect(menu === null || menu.style.display === "none").toBe(true);
});

it("[[Name]] with its closing brackets still finds the target", async () => {
	const editor = open(source());
	await insert(editor, "[[Trip plan]]");
	expect(labels()).toEqual(["Trip plan"]);
	await pick("note:n1");
	expect(editor.getText()).toBe("Trip plan ");
});

it("[[ does not offer the note being edited", async () => {
	const editor = open(source(), "n1");
	await insert(editor, "[[");
	expect(labels()).toEqual(["Ideas", "Sam Rivera"]);
});

it("punctuation typed right after a link takes the space with it", async () => {
	const editor = open(source());
	await insert(editor, "@Sam");
	await pick("resource:r1");
	const { from } = editor.state.selection;
	await act(async () => {
		editor.view.someProp("handleTextInput", (f) =>
			f(editor.view, from, from, ".", () => editor.state.tr),
		);
	});
	expect(editor.getText()).toBe("Sam Rivera.");
	// Other characters keep the space.
	await insert(editor, "x");
	expect(editor.getText()).toBe("Sam Rivera.x");
});

it("Tab picks the highlighted item", async () => {
	const editor = open(source());
	await insert(editor, "@");
	await act(async () => {
		editor.view.someProp("handleKeyDown", (f) =>
			f(editor.view, new KeyboardEvent("keydown", { key: "Tab" })),
		);
	});
	expect(editor.getText()).toBe("Sam Rivera ");
});

it("Enter picks inside a task block instead of starting another task", async () => {
	const editor = open(source(), undefined, {
		type: "doc",
		content: [{ type: "taskBlock", attrs: { id: "t" } }],
	});
	await insert(editor, "Ask @Sam");
	await act(async () => {
		editor.view.someProp("handleKeyDown", (f) =>
			f(editor.view, new KeyboardEvent("keydown", { key: "Enter" })),
		);
	});
	const blocks = editor.getJSON().content ?? [];
	expect(blocks).toHaveLength(1);
	expect(editor.getText()).toBe("Ask Sam Rivera ");
});

it("copies as plain text with the name", async () => {
	const editor = open(source(), undefined, linkDoc("n1", "Trip plan"));
	await settle();
	expect(editor.getText()).toBe("see Trip plan now");
});
