// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

it("offers align for two items and distribute for three, and says what each does", () => {
	const onArrange = vi.fn();
	const props = {
		blocks: [card("a"), card("b"), card("c")],
		onGroup: vi.fn(),
		onUngroup: vi.fn(),
		onDelete: vi.fn(),
		onArrange,
	};
	const disabled = (name: string) =>
		(screen.getByRole("button", { name }) as HTMLButtonElement).disabled;
	const view = render(<CanvasSelectionBar ids={["a"]} {...props} />);
	expect(disabled("Align left")).toBe(true);
	view.rerender(<CanvasSelectionBar ids={["a", "b"]} {...props} />);
	expect(disabled("Align left")).toBe(false);
	expect(disabled("Distribute horizontally")).toBe(true);
	expect(disabled("Distribute vertically")).toBe(true);
	view.rerender(<CanvasSelectionBar ids={["a", "b", "c"]} {...props} />);
	const expected: [string, string][] = [
		["Align left", "left"],
		["Align centres horizontally", "center"],
		["Align right", "right"],
		["Align top", "top"],
		["Align middles vertically", "middle"],
		["Align bottom", "bottom"],
		["Distribute horizontally", "distribute-horizontal"],
		["Distribute vertically", "distribute-vertical"],
	];
	for (const [name, how] of expected) {
		fireEvent.click(screen.getByRole("button", { name }));
		expect(onArrange).toHaveBeenLastCalledWith(how);
	}
	expect(onArrange).toHaveBeenCalledTimes(8);
});

it("does not count a connector as something to arrange, and hides the buttons without a handler", () => {
	const onArrange = vi.fn();
	const props = {
		blocks: [card("a"), card("b"), link],
		onGroup: vi.fn(),
		onUngroup: vi.fn(),
		onDelete: vi.fn(),
	};
	const view = render(
		<CanvasSelectionBar ids={["a", "k"]} {...props} onArrange={onArrange} />,
	);
	expect(
		(screen.getByRole("button", { name: "Align left" }) as HTMLButtonElement)
			.disabled,
	).toBe(true);
	view.rerender(<CanvasSelectionBar ids={["a", "b"]} {...props} />);
	expect(screen.queryByRole("button", { name: "Align left" })).toBeNull();
});

const note = (id: string, type: string): Block => ({
	id,
	type,
	parent: null,
	attrs: { x: 0, y: 0 },
});

it("offers a style panel with a color section for cards, sticky notes and shapes, and passes only those on", async () => {
	const onTone = vi.fn();
	const props = {
		blocks: [
			note("s", "sticky"),
			note("h", "shape"),
			card("c"),
			note("l", "label"),
			note("g", "group"),
		],
		onGroup: vi.fn(),
		onUngroup: vi.fn(),
		onDelete: vi.fn(),
		onTone,
	};
	const user = userEvent.setup();
	const view = render(<CanvasSelectionBar ids={["l", "g"]} {...props} />);
	expect(screen.queryByRole("button", { name: /Style/ })).toBeNull();
	view.rerender(<CanvasSelectionBar ids={["c"]} {...props} />);
	expect(screen.getByRole("button", { name: /Style/ })).toBeTruthy();
	view.rerender(
		<CanvasSelectionBar ids={["s", "h", "c", "l", "g"]} {...props} />,
	);
	await user.click(screen.getByRole("button", { name: /Style/ }));
	for (const name of ["Note", "Info", "Tip", "Warning", "Danger"])
		expect(screen.getByRole("button", { name })).toBeTruthy();
	// No shape or text size handler was given, so those sections are absent.
	expect(screen.queryByText("Shape")).toBeNull();
	expect(screen.queryByText("Text size")).toBeNull();
	await user.click(screen.getByRole("button", { name: "Tip" }));
	expect(onTone).toHaveBeenCalledWith(["s", "h", "c"], "tip");
});

it("shows the current color when the whole selection agrees, and none when it differs", async () => {
	const props = {
		onGroup: vi.fn(),
		onUngroup: vi.fn(),
		onDelete: vi.fn(),
		onTone: vi.fn(),
	};
	const tipped = {
		...note("a", "sticky"),
		attrs: { x: 0, y: 0, tone: "tip" },
	};
	const user = userEvent.setup();
	const view = render(
		<CanvasSelectionBar
			ids={["a"]}
			blocks={[tipped, note("b", "sticky")]}
			{...props}
		/>,
	);
	await user.click(screen.getByRole("button", { name: /Style/ }));
	expect(
		screen.getByRole("button", { name: "Tip" }).getAttribute("aria-pressed"),
	).toBe("true");
	expect(
		screen.getByRole("button", { name: "Note" }).getAttribute("aria-pressed"),
	).toBe("false");
	view.rerender(
		<CanvasSelectionBar
			ids={["a", "b"]}
			blocks={[tipped, note("b", "sticky")]}
			{...props}
		/>,
	);
	expect(
		screen.getByRole("button", { name: "Tip" }).getAttribute("aria-pressed"),
	).toBe("false");
	expect(
		screen.getByRole("button", { name: "Note" }).getAttribute("aria-pressed"),
	).toBe("false");
});

it("shows the shape section for shapes only and the text size section for text items", async () => {
	const onShape = vi.fn();
	const onTextSize = vi.fn();
	const props = {
		blocks: [
			note("h", "shape"),
			note("s", "sticky"),
			note("l", "label"),
			card("c"),
		],
		onGroup: vi.fn(),
		onUngroup: vi.fn(),
		onDelete: vi.fn(),
		onShape,
		onTextSize,
	};
	const user = userEvent.setup();
	const view = render(<CanvasSelectionBar ids={["c"]} {...props} />);
	// A card has neither an outline nor a text size, and no color handler is given.
	expect(screen.queryByRole("button", { name: /Style/ })).toBeNull();
	view.rerender(<CanvasSelectionBar ids={["s", "l"]} {...props} />);
	await user.click(screen.getByRole("button", { name: /Style/ }));
	expect(screen.queryByText("Shape")).toBeNull();
	await user.click(screen.getByRole("button", { name: "Large" }));
	expect(onTextSize).toHaveBeenCalledWith(["s", "l"], "l");
	view.rerender(<CanvasSelectionBar ids={["h", "s", "c"]} {...props} />);
	await user.click(screen.getByRole("button", { name: "Ellipse" }));
	expect(onShape).toHaveBeenCalledWith(["h"], "ellipse");
	await user.click(screen.getByRole("button", { name: "Small" }));
	expect(onTextSize).toHaveBeenLastCalledWith(["h", "s"], "s");
});

it("hides the style panel without any handler", () => {
	render(
		<CanvasSelectionBar
			ids={["s"]}
			blocks={[note("s", "sticky")]}
			onGroup={vi.fn()}
			onUngroup={vi.fn()}
			onDelete={vi.fn()}
		/>,
	);
	expect(screen.queryByRole("button", { name: /Style/ })).toBeNull();
});

it("offers the stacking order for items that stack, and passes only those on", async () => {
	const onOrder = vi.fn();
	const props = {
		blocks: [
			note("s", "sticky"),
			card("c"),
			note("g", "group"),
			{
				id: "k",
				type: "connector",
				parent: null,
				attrs: { from: "s", to: "c" },
			},
		],
		onGroup: vi.fn(),
		onUngroup: vi.fn(),
		onDelete: vi.fn(),
		onOrder,
	};
	const user = userEvent.setup();
	const view = render(<CanvasSelectionBar ids={["g", "k"]} {...props} />);
	expect(screen.queryByRole("button", { name: /Order/ })).toBeNull();
	view.rerender(<CanvasSelectionBar ids={["s", "c", "g", "k"]} {...props} />);
	await user.click(screen.getByRole("button", { name: /Order/ }));
	for (const name of [
		"Bring to front",
		"Bring forward",
		"Send backward",
		"Send to back",
	])
		expect(screen.getByRole("menuitem", { name })).toBeTruthy();
	await user.click(screen.getByRole("menuitem", { name: "Send to back" }));
	expect(onOrder).toHaveBeenCalledWith(["s", "c"], "back");
});

it("hides the order menu without a handler", () => {
	render(
		<CanvasSelectionBar
			ids={["s"]}
			blocks={[note("s", "sticky")]}
			onGroup={vi.fn()}
			onUngroup={vi.fn()}
			onDelete={vi.fn()}
		/>,
	);
	expect(screen.queryByRole("button", { name: /Order/ })).toBeNull();
});

const shape: Block = {
	id: "h",
	type: "shape",
	parent: null,
	attrs: { shape: "ellipse", size: "l", tone: "tip" },
	content: [{ text: "Idea", type: "text" }],
};

it("shows text on a shape, edits it in place, and draws its outline, color and size", () => {
	const onText = vi.fn();
	render(
		<CanvasItem block={shape} editable onText={onText} onTitle={vi.fn()} />,
	);
	const item = screen.getByLabelText("shape");
	expect(item.getAttribute("data-shape")).toBe("ellipse");
	expect(item.getAttribute("data-tone")).toBe("tip");
	expect(item.getAttribute("data-size")).toBe("l");
	fireEvent.doubleClick(screen.getByText("Idea"));
	const field = screen.getByRole("textbox", { name: "Text of shape" });
	fireEvent.change(field, { target: { value: "Better idea" } });
	// Cmd+Enter saves, like on a sticky note.
	fireEvent.keyDown(field, { key: "Enter", metaKey: true });
	expect(onText).toHaveBeenCalledWith("Better idea");
});

it("lets a shape's text be cleared, and a shape without text or attributes uses the defaults", () => {
	const onText = vi.fn();
	const bare: Block = { id: "b", type: "shape", parent: null };
	const view = render(
		<CanvasItem block={shape} editable onText={onText} onTitle={vi.fn()} />,
	);
	fireEvent.doubleClick(screen.getByText("Idea"));
	const field = screen.getByRole("textbox", { name: "Text of shape" });
	fireEvent.change(field, { target: { value: "" } });
	fireEvent.blur(field);
	expect(onText).toHaveBeenCalledWith("");
	view.rerender(
		<CanvasItem block={bare} editable onText={onText} onTitle={vi.fn()} />,
	);
	const item = screen.getByLabelText("shape");
	expect(item.getAttribute("data-shape")).toBe("rectangle");
	expect(item.getAttribute("data-size")).toBe("m");
	expect(item.getAttribute("data-tone")).toBe("note");
});
