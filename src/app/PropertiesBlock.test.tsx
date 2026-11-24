// @vitest-environment happy-dom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import type { Props } from "../core/notes/properties";
import { PropertiesBlock } from "./PropertiesBlock";
import { VaultTags } from "./TagChips";

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

it("changes a property's type from its settings and carries the value", async () => {
	const user = userEvent.setup();
	const onChange = setup();
	await user.click(screen.getByRole("button", { name: /Settings for Pages/ }));
	await user.click(await screen.findByRole("button", { name: "Text" }));
	expect(entry(onChange.mock.lastCall?.[0], "Pages")).toEqual({
		type: "text",
		value: "3",
	});
});

/** The block with its own state, so changes show up like in the app. */
function Live(props: { start: Props; onChange?: (p: Props) => void }) {
	const [value, setValue] = useState(props.start);
	return (
		<PropertiesBlock
			props={value}
			editable
			onChange={(next) => {
				setValue(next);
				props.onChange?.(next);
			}}
		/>
	);
}

it("adds a property named after its type and opens its settings to rename it", async () => {
	const user = userEvent.setup();
	const onChange = vi.fn();
	render(<Live start={{}} onChange={onChange} />);
	await user.click(screen.getByRole("button", { name: /Add property/ }));
	await user.click(
		await screen.findByRole("button", { name: "Add Date property" }),
	);
	expect(entry(onChange.mock.lastCall?.[0], "Date")).toEqual({
		type: "date",
		value: null,
	});
	const name = await screen.findByRole("textbox", { name: "Property name" });
	await user.clear(name);
	await user.type(name, "Due{Enter}");
	expect(Object.keys(onChange.mock.lastCall?.[0] as Props)).toEqual(["Due"]);
	// A second one of the same type gets the next free name.
	await user.keyboard("{Escape}");
	await user.click(screen.getByRole("button", { name: /Add property/ }));
	await user.click(
		await screen.findByRole("button", { name: "Add Date property" }),
	);
	await user.keyboard("{Escape}");
	await user.click(screen.getByRole("button", { name: /Add property/ }));
	await user.click(
		await screen.findByRole("button", { name: "Add Date property" }),
	);
	expect(Object.keys(onChange.mock.lastCall?.[0] as Props)).toEqual([
		"Due",
		"Date",
		"Date 2",
	]);
});

it("edits a select's options and removes the property from its settings", async () => {
	const user = userEvent.setup();
	const onChange = vi.fn();
	render(
		<Live
			start={{ Status: { type: "select", value: null, options: ["Open"] } }}
			onChange={onChange}
		/>,
	);
	await user.click(screen.getByRole("button", { name: /Settings for Status/ }));
	const dialog = await screen.findByRole("dialog");
	await user.type(
		within(dialog).getByRole("textbox", { name: "Add to Status options" }),
		"Done{Enter}",
	);
	expect(entry(onChange.mock.lastCall?.[0], "Status")).toMatchObject({
		options: ["Open", "Done"],
	});
	await user.click(
		within(dialog).getByRole("button", {
			name: "Remove Open from Status options",
		}),
	);
	expect(entry(onChange.mock.lastCall?.[0], "Status")).toMatchObject({
		options: ["Done"],
	});
	await user.click(
		within(dialog).getByRole("button", { name: "Remove property" }),
	);
	expect(onChange.mock.lastCall?.[0]).toEqual({});
});

it("adds and removes tags", async () => {
	const user = userEvent.setup();
	const onChange = setup();
	await user.type(
		screen.getByRole("combobox", { name: "Add to tags" }),
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
	expect(screen.queryByRole("button", { name: /Settings for/ })).toBeNull();
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

const vaultTags = [
	{ tag: "school", count: 4 },
	{ tag: "ADD-103", count: 2 },
	{ tag: "schedule", count: 1 },
];

function withTags(start: Props) {
	const onChange = vi.fn();
	render(
		<VaultTags.Provider value={vaultTags}>
			<Live start={start} onChange={onChange} />
		</VaultTags.Provider>,
	);
	return {
		onChange,
		field: () => screen.getByRole("combobox", { name: "Add to tags" }),
		tags: () =>
			(entry(onChange.mock.lastCall?.[0], "tags") as { value: string[] }).value,
	};
}

it("suggests tags already in the vault and takes the existing spelling", async () => {
	const user = userEvent.setup();
	const t = withTags({});
	await user.type(t.field(), "add 103");
	const list = await screen.findByRole("listbox", { name: "Tag suggestions" });
	expect(within(list).getAllByRole("option")[0]?.textContent).toContain(
		"ADD-103",
	);
	await user.keyboard("{Enter}");
	expect(t.tags()).toEqual(["ADD-103"]);
	// A different capital letter becomes the existing tag too.
	await user.type(t.field(), "School{Enter}");
	expect(t.tags()).toEqual(["ADD-103", "school"]);
});

it("keeps the spelling as typed when the suggestion is declined", async () => {
	const user = userEvent.setup();
	const t = withTags({});
	await user.type(t.field(), "School");
	await screen.findByRole("listbox");
	await user.keyboard("{ArrowDown}{Enter}");
	expect(t.tags()).toEqual(["School"]);
	await user.type(t.field(), "sch");
	await screen.findByRole("listbox");
	await user.keyboard("{Escape}{Enter}");
	expect(t.tags()).toEqual(["School", "sch"]);
});

it("Backspace in the empty tag field removes the last tag", async () => {
	const user = userEvent.setup();
	const t = withTags({ tags: { type: "list", value: ["a", "b"] } });
	await user.click(t.field());
	await user.keyboard("{Backspace}");
	expect(t.tags()).toEqual(["a"]);
});
