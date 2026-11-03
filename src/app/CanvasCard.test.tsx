// @vitest-environment happy-dom
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import type { Block } from "../core/note-format";
import { CanvasCard } from "./CanvasCard";

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
