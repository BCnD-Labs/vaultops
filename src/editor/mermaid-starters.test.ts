// @vitest-environment happy-dom

import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import mermaid from "mermaid";
import { expect, it } from "vitest";
import { isEnabled } from "../core/features/registry";
import { filterSlashItems } from "./slash-items";

const starters = filterSlashItems("mermaid").filter(
	(item) => item.section === "Visual",
);

it.each(starters)("inserts an editable, valid $label", async (item) => {
	const editor = new Editor({
		extensions: [StarterKit],
		content: "<p>/mer</p>",
	});
	try {
		editor.commands.setTextSelection(5);
		item.run(editor, { from: 1, to: 5 });
		const { selection } = editor.state;
		const block = selection.$from.parent;
		expect(selection.empty).toBe(true);
		expect(block.type.name).toBe("codeBlock");
		expect(block.attrs.language).toBe("mermaid");
		expect(selection.$from.parentOffset).toBe(block.textContent.length);
		await expect(mermaid.parse(block.textContent)).resolves.toBeTruthy();
	} finally {
		editor.destroy();
	}
});

it("hides every starter from Visual, search and Recent when Diagrams is off", () => {
	const where = {
		columns: true,
		enabled: (id: string) => isEnabled(id, { mermaid: false }),
	};
	expect(starters).toHaveLength(6);
	for (const item of starters) {
		for (const query of ["", "mermaid"]) {
			expect(
				filterSlashItems(query, where, [item.id]).map((row) => row.id),
			).not.toContain(item.id);
		}
	}
});

it("keeps the text on both sides of an inline slash in its own paragraphs", () => {
	const editor = new Editor({
		extensions: [StarterKit],
		content: "<p>Before /mer after</p>",
	});
	try {
		starters[0]?.run(editor, { from: 8, to: 12 });
		const { doc, selection } = editor.state;
		expect(doc.firstChild?.textContent).toBe("Before ");
		expect(doc.lastChild?.textContent).toBe(" after");
		expect(selection.$from.parent).toBe(doc.child(1));
	} finally {
		editor.destroy();
	}
});
