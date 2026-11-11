// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { LinkedFromPanel, linkedFrom } from "./LinkedFromPanel";
import type { NoteRow } from "./session";

afterEach(() => cleanup());

const row = (title: string, links: string[], extra: Partial<NoteRow> = {}) => ({
	title,
	path: `${title}.vnote`,
	id: `id-${title}`,
	preview: "",
	readOnly: false,
	tags: [],
	links,
	...extra,
});

it("lists notes and canvases that link to this note, by title, never itself", () => {
	const notes = [
		row("Zed", ["target"]),
		row("Alpha", ["target", "other"]),
		row("Board", ["target"], { kind: "canvas" }),
		row("Quiet", ["other"]),
		row("Target", ["target"], { id: "target" }),
		row("NoLinks", [], { links: undefined }),
	];
	expect(linkedFrom(notes, "target").map((r) => r.title)).toEqual([
		"Alpha",
		"Board",
		"Zed",
	]);
	expect(linkedFrom(notes, undefined)).toEqual([]);
});

it("opens a linking note, and explains an empty list", async () => {
	const user = userEvent.setup();
	const onOpen = vi.fn();
	const { rerender } = render(
		<LinkedFromPanel rows={[row("Alpha", ["t"])]} onOpen={onOpen} />,
	);
	await user.click(screen.getByRole("button", { name: /Alpha/ }));
	expect(onOpen).toHaveBeenCalledWith("Alpha.vnote");
	rerender(<LinkedFromPanel rows={[]} onOpen={onOpen} />);
	expect(screen.getByText(/Nothing links here yet/)).toBeTruthy();
});
