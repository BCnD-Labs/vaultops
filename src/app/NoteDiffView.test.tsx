// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { diffNotes } from "../core/history/diff";
import type { Block, Note } from "../core/note-format";
import { NoteDiffView } from "./NoteDiffView";

afterEach(cleanup);

const p = (id: string, text: string): Block => ({
	id,
	type: "paragraph",
	parent: null,
	content: [{ type: "text", text }],
});
const note = (blocks: Block[], header: Record<string, unknown> = {}): Note =>
	({
		header: { format: "vaultops-note", v: 1, noteId: "n", ...header },
		blocks,
	}) as Note;

it("shows word changes, added and removed blocks, and header changes", () => {
	const before = note([p("a", "The quick fox"), p("gone", "Old line")], {
		title: "Fox",
		props: { Status: { type: "text", value: "Draft" } },
	});
	const after = note([p("a", "The slow fox"), p("new", "Fresh line")], {
		title: "Fox story",
		props: { Status: { type: "text", value: "Done" } },
	});
	const { container } = render(
		<NoteDiffView diff={diffNotes(before, after)} />,
	);
	const ins = [...container.querySelectorAll("ins")].map((e) => e.textContent);
	const del = [...container.querySelectorAll("del")].map((e) => e.textContent);
	expect(ins).toEqual(["Fox story", "Done", "slow", "Fresh line"]);
	expect(del).toEqual(["Fox", "Draft", "quick", "Old line"]);
	expect(screen.getByText("The", { exact: false })).toBeTruthy();
});

it("says when nothing changed", () => {
	const n = note([p("a", "x")]);
	render(<NoteDiffView diff={diffNotes(n, n)} />);
	expect(screen.getByText("No changes.")).toBeTruthy();
});
