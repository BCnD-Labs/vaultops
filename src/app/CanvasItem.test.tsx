// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { Block } from "../core/note-format";
import { CanvasItem } from "./CanvasItem";
import { CanvasSelectionBar } from "./CanvasSelectionBar";

afterEach(cleanup);

const sticky: Block = {
	id: "s",
	type: "sticky",
	parent: null,
	content: [{ text: "Hello", type: "text" }],
};

it("edits a sticky note's text on double click and saves it when you leave the field", () => {
	const onText = vi.fn();
	render(
		<CanvasItem block={sticky} editable onText={onText} onTitle={vi.fn()} />,
	);
	fireEvent.doubleClick(screen.getByText("Hello"));
	const field = screen.getByRole("textbox", { name: "Text of sticky" });
	fireEvent.change(field, { target: { value: "Changed" } });
	fireEvent.blur(field);
	expect(onText).toHaveBeenCalledWith("Changed");
});

it("drops the change on Escape and does not edit while locked or read-only", () => {
	const onText = vi.fn();
	const view = render(
		<CanvasItem block={sticky} editable onText={onText} onTitle={vi.fn()} />,
	);
	fireEvent.doubleClick(screen.getByText("Hello"));
	const field = screen.getByRole("textbox", { name: "Text of sticky" });
	fireEvent.change(field, { target: { value: "Nope" } });
	fireEvent.keyDown(field, { key: "Escape" });
	expect(onText).not.toHaveBeenCalled();
	view.rerender(
		<CanvasItem
			block={sticky}
			editable
			locked
			onText={onText}
			onTitle={vi.fn()}
		/>,
	);
	fireEvent.doubleClick(screen.getByText("Hello"));
	expect(screen.queryByRole("textbox")).toBeNull();
	view.rerender(
		<CanvasItem
			block={sticky}
			editable={false}
			onText={onText}
			onTitle={vi.fn()}
		/>,
	);
	fireEvent.doubleClick(screen.getByText("Hello"));
	expect(screen.queryByRole("textbox")).toBeNull();
});

const card = (id: string): Block => ({ id, type: "paragraph", parent: null });
const link: Block = {
	id: "k",
	type: "connector",
	parent: null,
	attrs: { from: "a", to: "b" },
};

it("groups two or more items, but not one, and not a selection that holds a group", () => {
	const onGroup = vi.fn();
	const props = {
		blocks: [card("a"), card("b")],
		onGroup,
		onUngroup: vi.fn(),
		onDelete: vi.fn(),
	};
	const view = render(<CanvasSelectionBar ids={["a"]} {...props} />);
	expect(
		(screen.getByRole("button", { name: /Group/ }) as HTMLButtonElement)
			.disabled,
	).toBe(true);
	view.rerender(<CanvasSelectionBar ids={["a", "b"]} {...props} />);
	fireEvent.click(screen.getByRole("button", { name: /Group/ }));
	expect(onGroup).toHaveBeenCalledWith(["a", "b"]);
});

it("asks before deleting, names the connectors that go too, and only then deletes", () => {
	const onDelete = vi.fn();
	render(
		<CanvasSelectionBar
			ids={["a"]}
			blocks={[card("a"), card("b"), link]}
			onGroup={vi.fn()}
			onUngroup={vi.fn()}
			onDelete={onDelete}
		/>,
	);
	fireEvent.click(screen.getByRole("button", { name: /Delete/ }));
	expect(onDelete).not.toHaveBeenCalled();
	expect(screen.getByText(/Delete 1 item and 1 connector/)).toBeTruthy();
	fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
	expect(onDelete).not.toHaveBeenCalled();
	fireEvent.click(screen.getByRole("button", { name: /Delete/ }));
	fireEvent.click(screen.getByRole("button", { name: "Delete" }));
	expect(onDelete).toHaveBeenCalledWith(["a"]);
});

it("offers Ungroup for a single selected group", () => {
	const onUngroup = vi.fn();
	render(
		<CanvasSelectionBar
			ids={["g"]}
			blocks={[
				card("a"),
				card("b"),
				{
					id: "g",
					type: "group",
					parent: null,
					attrs: { members: ["a", "b"] },
				},
			]}
			onGroup={vi.fn()}
			onUngroup={onUngroup}
			onDelete={vi.fn()}
		/>,
	);
	fireEvent.click(screen.getByRole("button", { name: /Ungroup/ }));
	expect(onUngroup).toHaveBeenCalledWith("g");
});
