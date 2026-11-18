// @vitest-environment happy-dom

import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { getSchema, type JSONContent } from "@tiptap/core";
import { DOMParser, DOMSerializer } from "@tiptap/pm/model";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { Block } from "../core/note-format";
import { blocksToDoc, docToBlocks } from "./doc-blocks";
import { createExtensions } from "./extensions";
import type { ImageSource } from "./image-block";
import { NoteEditor } from "./NoteEditor";

const schema = getSchema(createExtensions());

const image = (attrs: Record<string, unknown>): JSONContent => ({
	type: "image",
	attrs: { id: "img", ...attrs },
});

function fakeSource(show?: ImageSource["show"]) {
	return {
		show: vi.fn(show ?? (async () => new Blob(["copy"]))),
		choose: vi.fn(async () => null),
		store: vi.fn(
			async (name: string, _bytes: ArrayBuffer) => `attachments/${name}`,
		),
	};
}

function renderNote(
	content: JSONContent[],
	source: ImageSource,
	editable = true,
) {
	const onChange = vi.fn();
	render(
		<TooltipProvider>
			<NoteEditor
				doc={{ type: "doc", content }}
				noteId="note-1"
				editable={editable}
				onChange={onChange}
				images={source}
			/>
		</TooltipProvider>,
	);
	const pm = document.querySelector(".ProseMirror") as HTMLElement;
	return { onChange, pm };
}

const lastDoc = (onChange: ReturnType<typeof vi.fn>) =>
	onChange.mock.lastCall?.[0] as JSONContent;

beforeEach(() => {
	// Happy DOM has no layout: every element is a 600 px column.
	vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(600);
	vi.stubGlobal("devicePixelRatio", 2);
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

it("saves an image block back to the same line, through the schema and the clipboard HTML", () => {
	const blocks: Block[] = [
		{
			id: "img",
			type: "image",
			parent: null,
			attrs: { src: "attachments/cat.png", alt: "A cat", width: 0.5 },
		},
		{
			id: "bare",
			type: "image",
			parent: null,
			attrs: { src: "attachments/b.gif" },
		},
	];
	const doc = schema.nodeFromJSON(blocksToDoc(blocks));
	expect(docToBlocks(doc.toJSON())).toEqual(blocks);
	const html = DOMSerializer.fromSchema(schema).serializeFragment(doc.content);
	const holder = document.createElement("div");
	holder.append(html);
	const parsed = DOMParser.fromSchema(schema).parse(holder);
	expect(docToBlocks(parsed.toJSON())).toEqual(blocks);
});

it("asks for a display copy as wide as the image is shown, times the pixel ratio", async () => {
	const source = fakeSource();
	renderNote([image({ src: "attachments/cat.png", width: 0.5 })], source);
	// 600 px column x 0.5 = 300 CSS px, x 2 = 600 device px, rounded up to 768.
	await waitFor(() =>
		expect(source.show).toHaveBeenCalledWith("attachments/cat.png", {
			width: 768,
			height: 2,
		}),
	);
	expect(source.show).toHaveBeenCalledTimes(1);
	await waitFor(() =>
		expect(document.querySelector(".image-block img")).not.toBeNull(),
	);
});

it("shows a quiet placeholder with the path and Remove for a missing file", async () => {
	const source = fakeSource(async () => {
		throw new Error("not found");
	});
	const { onChange } = renderNote(
		[image({ src: "attachments/gone.png" })],
		source,
	);
	await screen.findByText("attachments/gone.png");
	fireEvent.click(screen.getByRole("button", { name: "Remove" }));
	expect(JSON.stringify(lastDoc(onChange))).not.toContain("image");
});

it("shows images in a read-only note without the handle or caption editing", async () => {
	const source = fakeSource();
	renderNote(
		[image({ src: "attachments/cat.png", alt: "A cat" })],
		source,
		false,
	);
	await waitFor(() =>
		expect(document.querySelector(".image-block img")).not.toBeNull(),
	);
	expect(document.querySelector("figcaption")?.textContent).toBe("A cat");
	expect(document.querySelector(".image-block-handle")).toBeNull();
	expect(document.querySelector(".image-block input")).toBeNull();
});

const png = () =>
	new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "image.png", {
		type: "image/png",
	});

const transfer = (files: File[]) => ({
	files,
	types: ["Files"],
	getData: () => "",
});

it("stores a pasted image as an attachment and adds a block for it", async () => {
	const source = fakeSource();
	const { onChange, pm } = renderNote(
		[{ type: "paragraph", attrs: { id: "p" } }],
		source,
	);
	fireEvent.paste(pm, { clipboardData: transfer([png()]) });
	await waitFor(() => expect(onChange).toHaveBeenCalled());
	const [name, bytes] = source.store.mock.calls[0] ?? [];
	expect(name).toBe("image.png");
	expect([...new Uint8Array(bytes ?? new ArrayBuffer(0))]).toEqual([
		0x89, 0x50, 0x4e, 0x47,
	]);
	expect(lastDoc(onChange).content?.[0]).toMatchObject({
		type: "image",
		attrs: { src: "attachments/image.png" },
	});
});
