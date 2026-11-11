// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import type { Props } from "../core/notes/properties";
import { PropertiesBlock } from "./PropertiesBlock";

const base: Props = {
	tags: { type: "list", value: ["idea"] },
	Summary: { type: "text", value: "Hello" },
	Pages: { type: "number", value: 3 },
	Mood: { type: "select", value: "Open" },
};

function entry(props: unknown, key: string) {
	return (props as Props)[key];
}

afterEach(() => {
	cleanup();
	localStorage.clear();
});

function setup(props: Props | null = base, editable = true) {
	const onChange = vi.fn();
	render(
		<PropertiesBlock props={props} editable={editable} onChange={onChange} />,
	);
	return onChange;
}

it("shows tags first, then a row per property, with a kept-as-is note for unknown ones", () => {
	setup();
	expect(screen.getByText("idea")).toBeTruthy();
	expect(
		(screen.getByRole("textbox", { name: "Summary" }) as HTMLInputElement)
			.value,
	).toBe("Hello");
	expect(screen.getByText(/select property: kept as it is/)).toBeTruthy();
});

it("renames a property on Enter and keeps its value", async () => {
	const user = userEvent.setup();
	const onChange = setup();
	const field = screen.getByRole("textbox", { name: "Property name Summary" });
	await user.clear(field);
	await user.type(field, "Blurb{Enter}");
	const next = onChange.mock.calls[0]?.[0] as Props;
	expect(Object.keys(next)).toEqual(["tags", "Blurb", "Pages", "Mood"]);
	expect(entry(next, "Blurb")).toEqual({ type: "text", value: "Hello" });
});

it("shows the refusal on a clash and puts the old name back", async () => {
	const user = userEvent.setup();
	const onChange = setup();
	const field = screen.getByRole("textbox", { name: "Property name Summary" });
	await user.clear(field);
	await user.type(field, "pages{Enter}");
	expect(onChange).not.toHaveBeenCalled();
	expect(screen.getByRole("alert").textContent).toMatch(/already a property/);
	expect((field as HTMLInputElement).value).toBe("Summary");
});

it("Escape reverts a half-typed name", async () => {
	const user = userEvent.setup();
	const onChange = setup();
	const field = screen.getByRole("textbox", { name: "Property name Summary" });
	await user.type(field, "xyz{Escape}");
	expect((field as HTMLInputElement).value).toBe("Summary");
	fireEvent.blur(field);
	expect(onChange).not.toHaveBeenCalled();
});

it("edits a value and removes a property", async () => {
	const user = userEvent.setup();
	const onChange = setup();
	await user.type(screen.getByRole("textbox", { name: "Summary" }), "!");
	expect(entry(onChange.mock.lastCall?.[0], "Summary")).toEqual({
		type: "text",
		value: "Hello!",
	});
	await user.click(
		screen.getByRole("button", { name: "Remove property Pages" }),
	);
	expect(Object.keys(onChange.mock.lastCall?.[0] as Props)).not.toContain(
		"Pages",
	);
});

it("changes a property's type from its icon and carries the value", async () => {
	const user = userEvent.setup();
	const onChange = setup();
	await user.click(screen.getByRole("button", { name: /Type of Pages/ }));
	await user.click(await screen.findByRole("menuitemradio", { name: /Text/ }));
	expect(entry(onChange.mock.lastCall?.[0], "Pages")).toEqual({
		type: "text",
		value: "3",
	});
});

it("adds a property by choosing its type, and a blank name is refused", async () => {
	const user = userEvent.setup();
	const onChange = setup();
	await user.click(screen.getByRole("button", { name: /Add property/ }));
	await user.click(
		await screen.findByRole("button", { name: "Add Date property" }),
	);
	expect(onChange).not.toHaveBeenCalled();
	expect(screen.getByRole("alert").textContent).toMatch(/name/);
	await user.type(
		screen.getByRole("textbox", { name: "New property name" }),
		"Due",
	);
	await user.click(screen.getByRole("button", { name: "Add Date property" }));
	expect(entry(onChange.mock.lastCall?.[0], "Due")).toEqual({
		type: "date",
		value: null,
	});
});

it("Enter in the new-name field adds a text property", async () => {
	const user = userEvent.setup();
	const onChange = setup();
	await user.click(screen.getByRole("button", { name: /Add property/ }));
	await user.type(
		await screen.findByRole("textbox", { name: "New property name" }),
		"Note{Enter}",
	);
	expect(entry(onChange.mock.lastCall?.[0], "Note")).toEqual({
		type: "text",
		value: "",
	});
});

it("adds and removes tags", async () => {
	const user = userEvent.setup();
	const onChange = setup();
	await user.type(
		screen.getByRole("textbox", { name: "Add to tags" }),
		"work{Enter}",
	);
	expect(entry(onChange.mock.lastCall?.[0], "tags")).toEqual({
		type: "list",
		value: ["idea", "work"],
	});
	await user.click(
		screen.getByRole("button", { name: "Remove idea from tags" }),
	);
	expect(entry(onChange.mock.lastCall?.[0], "tags")).toEqual({
		type: "list",
		value: [],
	});
});

it("remembers collapsing", async () => {
	const user = userEvent.setup();
	setup();
	await user.click(screen.getByRole("button", { name: "Properties" }));
	expect(screen.queryByRole("textbox", { name: "Summary" })).toBeNull();
	expect(localStorage.getItem("vaultops:properties-block-open")).toBe("false");
	cleanup();
	setup();
	expect(screen.queryByRole("textbox", { name: "Summary" })).toBeNull();
});

it("read-only shows values without edit controls, and nothing when empty", () => {
	setup(base, false);
	expect(screen.queryByRole("button", { name: /Add property/ })).toBeNull();
	expect(screen.queryByRole("button", { name: /Remove/ })).toBeNull();
	expect(screen.queryByRole("button", { name: /Type of/ })).toBeNull();
	cleanup();
	const { container } = render(
		<PropertiesBlock props={{}} editable={false} onChange={vi.fn()} />,
	);
	expect(container.textContent).toBe("");
});

it("explains properties it can't edit", () => {
	setup(null);
	expect(screen.getByText(/can't edit/)).toBeTruthy();
});

it("clears a chosen select value from the dropdown and from the segments", async () => {
	const user = userEvent.setup();
	const many = ["a", "b", "c", "d", "e", "f"];
	const onChange = setup({
		Big: { type: "select", value: "c", options: many },
		Small: { type: "select", value: "x", options: ["x", "y"] },
	});
	await user.click(screen.getByRole("button", { name: "Clear Big" }));
	expect(entry(onChange.mock.calls[0]?.[0], "Big")).toEqual({
		type: "select",
		value: null,
		options: many,
	});
	await user.click(screen.getByRole("radio", { name: "x" }));
	expect(entry(onChange.mock.calls[1]?.[0], "Small")).toMatchObject({
		value: null,
	});
});
