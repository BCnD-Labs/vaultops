import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Props } from "../core/notes/properties";
import { PropertiesPanel } from "./PropertiesPanel";
import { TaggedNotes, TagIndex } from "./TagBrowser";

const props: Props = {
	tags: { type: "list", value: ["idea", "Work"] },
	Summary: { type: "text", value: "hello" },
	Pages: { type: "number", value: 12 },
	Due: { type: "date", value: "2026-11-05" },
	Done: { type: "checkbox", value: true },
	Authors: { type: "list", value: ["Ann"] },
	Status: { type: "select", value: "Open" },
};

function panel(p: Props | null, editable = true) {
	return renderToStaticMarkup(
		createElement(PropertiesPanel, {
			props: p,
			editable,
			onChange: () => {},
			onOpenTag: () => {},
		}),
	);
}

describe("PropertiesPanel", () => {
	it("shows tags first, then each property with a control for its type", () => {
		const out = panel(props);
		expect(out.indexOf("Tags")).toBeLessThan(out.indexOf("Summary"));
		expect(out).toContain('value="hello"');
		expect(out).toContain('type="number"');
		expect(out).toContain('value="2026-11-05"');
		expect(out).toContain('type="checkbox"');
		expect(out).toContain('aria-label="Remove Ann from Authors"');
		expect(out).toContain('title="Show notes tagged idea"');
	});

	it("shows a type this version does not know as kept as it is, and can remove it", () => {
		const out = panel(props);
		expect(out).toContain("select property: kept as it is");
		expect(out).toContain('aria-label="Remove property Status"');
	});

	it("is read-only when the note is: no add form, no remove buttons, disabled values", () => {
		const out = panel(props, false);
		expect(out).not.toContain("New property");
		expect(out).not.toContain("Remove property");
		expect(out).not.toContain("Add to tags");
		expect(out).toContain("disabled");
	});

	it("explains when the file keeps its properties in a form it can't edit", () => {
		expect(panel(null)).toContain("kept as they are");
	});
});

describe("tag browser", () => {
	const rows = [
		{ path: "a.vnote", title: "Alpha", tags: ["idea"] },
		{ path: "b.vnote", title: "Beta", tags: ["Idea", "work"] },
		{ path: "c.vnote", title: "Gamma", tags: [] },
	];

	it("lists each tag once with its note count and marks the open one", () => {
		const out = renderToStaticMarkup(
			createElement(TagIndex, { rows, active: "IDEA", onPick: () => {} }),
		);
		expect(out.match(/tag-button/g)?.length).toBe(2);
		expect(out).toContain('aria-pressed="true"');
		expect(out).toContain(">2<");
	});

	it("shows nothing when no note has a tag", () => {
		const out = renderToStaticMarkup(
			createElement(TagIndex, {
				rows: [rows[2] as (typeof rows)[0]],
				active: null,
				onPick: () => {},
			}),
		);
		expect(out).toBe("");
	});

	it("lists only the notes that carry the tag", () => {
		const out = renderToStaticMarkup(
			createElement(TaggedNotes, {
				rows,
				tag: "idea",
				livePath: "b.vnote",
				onOpen: () => {},
				onClear: () => {},
			}),
		);
		expect(out).toContain("Alpha");
		expect(out).toContain("Beta");
		expect(out).not.toContain("Gamma");
		expect(out).toContain("Show all notes");
	});
});

describe("PropertiesPanel select", () => {
	const sel = (value: string | null, options: string[]): Props => ({
		Stage: { type: "select", value, options },
	});
	it("shows segments for five options or fewer", () => {
		const out = panel(sel("Open", ["Open", "Done"]));
		expect(out).toContain('aria-label="Stage"');
		expect(out).toContain("Open");
		expect(out).toContain('aria-label="Edit options of Stage"');
	});
	it("uses a dropdown for more than five and flags a value that is not an option", () => {
		const out = panel(sel("Zed", ["a", "b", "c", "d", "e", "f"]));
		expect(out).toContain('role="combobox"');
		expect(out).toContain("Zed is not an option");
	});
});

describe("PropertiesPanel select clear", () => {
	const many = ["a", "b", "c", "d", "e", "f"];
	it("offers Clear on a set dropdown, but not when empty or read-only", () => {
		const set: Props = { Stage: { type: "select", value: "a", options: many } };
		const empty: Props = {
			Stage: { type: "select", value: null, options: many },
		};
		expect(panel(set)).toContain('aria-label="Clear Stage"');
		expect(panel(empty)).not.toContain('aria-label="Clear Stage"');
		expect(panel(set, false)).not.toContain('aria-label="Clear Stage"');
	});
});
