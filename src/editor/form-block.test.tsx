// @vitest-environment happy-dom

import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { type Editor, EditorContent, useEditor } from "@tiptap/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Props } from "../core/notes/properties";
import { blocksToDoc, docToBlocks } from "./doc-blocks";
import { createExtensions } from "./extensions";
import { FormBlock, type FormSource } from "./form-block";
import { SLASH_ITEMS } from "./slash-items";

let current: Editor | null = null;

function Harness({ content, source }: { content: object; source: FormSource }) {
	const editor = useEditor({
		extensions: createExtensions().map((e) =>
			e.name === "formBlock"
				? FormBlock.configure({ source: () => source })
				: e,
		),
		content,
	});
	current = editor;
	return <EditorContent editor={editor} />;
}

function fakeSource(
	initial: Props | null,
	create = vi.fn(async (): Promise<string | null> => null),
) {
	let props = initial;
	const listeners = new Set<() => void>();
	const source: FormSource = {
		props: () => props,
		editable: () => true,
		setProps: (next) => {
			props = next;
			for (const l of listeners) l();
		},
		subscribe: (l) => {
			listeners.add(l);
			return () => void listeners.delete(l);
		},
		templates: async () => [{ label: "Lecture" }],
		folders: () => ["Projects"],
		canCreate: () => true,
		create,
	};
	return { source, create, props: () => props };
}

const form = (attrs: object) => ({
	type: "doc",
	content: [{ type: "formBlock", attrs: { id: "f", ...attrs } }],
});

afterEach(cleanup);

describe("form block, fill mode", () => {
	it("writes an answer into the note's properties, adding the property when missing", async () => {
		const fake = fakeSource({});
		render(
			<Harness
				source={fake.source}
				content={form({
					fields: [{ name: "Due", type: "date", label: "Due date" }],
				})}
			/>,
		);
		const input = await screen.findByLabelText("Due date");
		fireEvent.change(input, { target: { value: "2026-11-05" } });
		await waitFor(() =>
			expect(fake.props()).toEqual({
				Due: { type: "date", value: "2026-11-05" },
			}),
		);
		// The block holds no answers itself.
		expect(
			docToBlocks(current?.getJSON() ?? { type: "doc" })[0]?.attrs,
		).toEqual({ fields: [{ name: "Due", type: "date", label: "Due date" }] });
	});
	it("shows the property's current value and follows later changes", async () => {
		const fake = fakeSource({ Mood: { type: "text", value: "calm" } });
		render(
			<Harness
				source={fake.source}
				content={form({ fields: [{ name: "Mood", type: "text" }] })}
			/>,
		);
		expect(
			((await screen.findByLabelText("Mood")) as HTMLInputElement).value,
		).toBe("calm");
		act(() => fake.source.setProps({ Mood: { type: "text", value: "busy" } }));
		await waitFor(() =>
			expect((screen.getByLabelText("Mood") as HTMLInputElement).value).toBe(
				"busy",
			),
		);
	});
	it("tolerates unreadable attrs and unreadable properties", async () => {
		const fake = fakeSource(null);
		render(
			<Harness
				source={fake.source}
				content={form({ mode: 9, fields: [{ name: "A", type: "x" }, 5] })}
			/>,
		);
		expect(
			await screen.findByText(
				/properties are saved in a form this version can't edit/,
			),
		).toBeTruthy();
	});
});

describe("form block, create mode", () => {
	it("creates a note from the answers, then clears the form", async () => {
		const fake = fakeSource({});
		render(
			<Harness
				source={fake.source}
				content={form({
					mode: "create",
					template: "Lecture",
					folder: "Projects",
					fields: [{ name: "Title", type: "text" }],
				})}
			/>,
		);
		const input = (await screen.findByLabelText("Title")) as HTMLInputElement;
		fireEvent.change(input, { target: { value: "Essay" } });
		fireEvent.click(screen.getByRole("button", { name: "Create" }));
		await waitFor(() => expect(fake.create).toHaveBeenCalledTimes(1));
		expect(fake.create).toHaveBeenCalledWith({
			config: expect.objectContaining({
				mode: "create",
				template: "Lecture",
				folder: "Projects",
			}),
			answers: { Title: "Essay" },
		});
		await waitFor(() => expect(input.value).toBe(""));
		// Create mode never touches this note's properties.
		expect(fake.props()).toEqual({});
	});
	it("keeps the answers and says why when creating fails", async () => {
		const fake = fakeSource(
			{},
			vi.fn(async () => "The template isn't available."),
		);
		render(
			<Harness
				source={fake.source}
				content={form({
					mode: "create",
					fields: [{ name: "Title", type: "text" }],
				})}
			/>,
		);
		const input = (await screen.findByLabelText("Title")) as HTMLInputElement;
		fireEvent.change(input, { target: { value: "Essay" } });
		fireEvent.click(screen.getByRole("button", { name: "Create" }));
		expect(await screen.findByRole("alert")).toBeTruthy();
		expect(input.value).toBe("Essay");
	});
});

describe("form block storage", () => {
	it("is a slash item behind the forms feature", () => {
		expect(SLASH_ITEMS.find((item) => item.id === "form")?.feature).toBe(
			"forms",
		);
	});
	it("saves an unreadable block back with its attrs unchanged", () => {
		const blocks = [
			{
				id: "f",
				type: "formBlock",
				parent: null,
				attrs: { mode: 3, fields: "bad" },
			},
		];
		expect(docToBlocks(blocksToDoc(blocks))).toEqual(blocks);
	});
});
