// @vitest-environment happy-dom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it } from "vitest";
import type { Block } from "../core/note-format";
import { BLOCK_DRAG_TYPE } from "../editor/block-drag";
import { CanvasCard } from "./CanvasCard";

afterEach(cleanup);

it("starts a canvas block drag with stable identifiers", () => {
	const root: Block = { id: "card", type: "paragraph", parent: null };
	const { container } = render(
		<CanvasCard root={root} blocks={[root]} canvasId="canvas" draggable />,
	);
	const transfer = new DataTransfer();
	fireEvent.dragStart(container.querySelector("article") as Element, {
		dataTransfer: transfer,
	});
	expect(JSON.parse(transfer.getData(BLOCK_DRAG_TYPE))).toEqual({
		noteId: "canvas",
		blockId: "card",
	});
});

it.each([
	["heading", "strong", "Heading"],
	["paragraph", "p", "Paragraph"],
	["taskBlock", "checkbox", "Task"],
	["blockquote", "blockquote", "Quote"],
	["codeBlock", "pre", "Code"],
])("renders %s as static readable content", (type, tag, content) => {
	const block: Block = {
		id: "root",
		type,
		parent: null,
		content: [{ type: "text", text: content }],
	};
	const html = renderToStaticMarkup(
		<CanvasCard root={block} blocks={[block]} />,
	);
	expect(html).toContain(content);
	expect(html).toContain(tag);
});

const toggleBlocks = (open: boolean): Block[] => [
	{
		id: "root",
		type: "toggle",
		parent: null,
		...(open ? { attrs: { open: true } } : {}),
	},
	{
		id: "summary",
		type: "paragraph",
		parent: "root",
		content: [{ type: "text", text: "Summary line" }],
	},
	{
		id: "body",
		type: "paragraph",
		parent: "root",
		content: [{ type: "text", text: "Body line" }],
	},
];

it("renders an open toggle with its summary and body", () => {
	const blocks = toggleBlocks(true);
	const html = renderToStaticMarkup(
		<CanvasCard root={blocks[0] as Block} blocks={blocks} />,
	);
	expect(html).toContain("Summary line");
	expect(html).toContain("Body line");
	expect(html).toContain('data-open="true"');
});

it("renders a closed toggle with only its summary", () => {
	const blocks = toggleBlocks(false);
	const html = renderToStaticMarkup(
		<CanvasCard root={blocks[0] as Block} blocks={blocks} />,
	);
	expect(html).toContain("Summary line");
	expect(html).not.toContain("Body line");
	expect(html).toContain('data-open="false"');
});

it.each(["bulletList", "orderedList", "table"])(
	"renders nested %s blocks",
	(type) => {
		const root: Block = { id: "root", type, parent: null };
		const child: Block = {
			id: "child",
			type: type === "table" ? "tableRow" : "listItem",
			parent: "root",
		};
		const cell: Block = {
			id: "cell",
			type: "tableCell",
			parent: "child",
			content: [{ type: "text", text: "Inside" }],
		};
		const blocks =
			type === "table"
				? [root, child, cell]
				: [root, { ...child, content: [{ type: "text", text: "Inside" }] }];
		expect(
			renderToStaticMarkup(<CanvasCard root={root} blocks={blocks} />),
		).toContain("Inside");
	},
);

it("numbers a code block's real lines on the canvas and keeps its wrap choice", () => {
	const code = (attrs?: Block["attrs"]): Block => ({
		id: "root",
		type: "codeBlock",
		parent: null,
		...(attrs ? { attrs } : {}),
		content: [{ type: "text", text: "one\n\nthree" }],
	});
	const draw = (block: Block) => {
		const { container } = render(<CanvasCard root={block} blocks={[block]} />);
		const pre = container.querySelector("pre");
		const numbers = container.querySelectorAll(".code-ln").length;
		const text = pre?.textContent;
		cleanup();
		return { pre, numbers, text };
	};
	const plain = draw(code());
	expect(plain.numbers).toBe(3);
	// The numbers are empty elements, so the text is only the code.
	expect(plain.text).toBe("one\n\nthree");
	expect(plain.pre?.getAttribute("data-wrap")).toBeNull();
	expect(draw(code({ wrap: true })).pre?.getAttribute("data-wrap")).toBe(
		"true",
	);
});

it("shows a code block's highlighted lines on the canvas, ignoring lines it doesn't have", () => {
	const block: Block = {
		id: "root",
		type: "codeBlock",
		parent: null,
		attrs: { highlight: "2,9" },
		content: [{ type: "text", text: "one\ntwo\nthree" }],
	};
	const { container } = render(<CanvasCard root={block} blocks={[block]} />);
	expect(
		Array.from(container.querySelectorAll(".code-ln[data-hl]")).length,
	).toBe(1);
	expect(container.querySelector(".code-hl")?.textContent).toBe("two");
	expect(container.querySelector("pre")?.textContent).toBe("one\ntwo\nthree");
});
