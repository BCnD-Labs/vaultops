import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildTree } from "../core/notes/tree";
import { NoteTree } from "./NoteTree";

const tree = buildTree(
	["Class", "Class/Week 1", "Empty"],
	[
		{ path: "Home.vnote", title: "Home", readOnly: false },
		{ path: "Class/Week 1/Lecture.vnote", title: "Lecture 1", readOnly: true },
	],
);

function html(livePath: string | null): string {
	return renderToStaticMarkup(
		createElement(NoteTree, { nodes: tree, livePath, onOpen: () => {} }),
	);
}

describe("NoteTree", () => {
	it("starts with folders closed and notes at the top level visible", () => {
		const out = html(null);
		expect(out).toContain("Class");
		expect(out).toContain("Empty");
		expect(out).toContain("Home");
		expect(out).not.toContain("Week 1");
		expect(out).not.toContain("Lecture 1");
		expect(out).toContain('aria-expanded="false"');
	});

	it("opens the folders above the note that is open and marks it current", () => {
		const out = html("Class/Week 1/Lecture.vnote");
		expect(out).toContain("Week 1");
		expect(out).toContain("Lecture 1");
		expect(out).toContain("read-only");
		expect(out).toContain('aria-current="true"');
		expect(out).not.toContain("Empty</p>");
	});

	it("never shows .vaultops", () => {
		expect(html("Class/Week 1/Lecture.vnote")).not.toContain("vaultops");
	});
});
