import { describe, expect, it } from "vitest";
import type { Note } from "../note-format";
import {
	answersToProps,
	applyAnswer,
	buildFormNote,
	fieldView,
	MAX_FORM_FIELDS,
	normalizeForm,
	titleFromAnswers,
} from "./forms";

describe("normalizeForm", () => {
	it("repairs unreadable attrs without throwing", () => {
		expect(normalizeForm({})).toEqual({
			mode: "fill",
			fields: [],
			template: "",
			folder: "",
		});
		expect(
			normalizeForm({
				mode: 7,
				fields: "nope",
				template: null,
				folder: "../outside",
			}),
		).toEqual({ mode: "fill", fields: [], template: "", folder: "" });
	});
	it("keeps good fields and drops bad, empty and repeated ones", () => {
		const form = normalizeForm({
			mode: "create",
			folder: "/Projects/2026/",
			fields: [
				{ name: "  Due  ", type: "date", label: " When " },
				{ name: "due", type: "text" },
				{ name: "", type: "text" },
				{ name: "Mood", type: "banana" },
				{ type: "text" },
				null,
				"x",
				{ name: "tags", type: "text" },
			],
		});
		expect(form.mode).toBe("create");
		expect(form.folder).toBe("Projects/2026");
		expect(form.fields).toEqual([
			{ name: "Due", type: "date", label: "When" },
			{ name: "Mood", type: "text" },
			{ name: "tags", type: "list" },
		]);
	});
	it("caps the number of fields", () => {
		const fields = Array.from({ length: 80 }, (_, i) => ({ name: `f${i}` }));
		expect(normalizeForm({ fields }).fields).toHaveLength(MAX_FORM_FIELDS);
	});
});

describe("fill mode", () => {
	const due = { name: "Due", type: "date" as const };
	it("adds a missing property with the field's type on first edit", () => {
		const made = applyAnswer({}, due, "2026-11-05");
		expect(made).toEqual({
			ok: true,
			props: { Due: { type: "date", value: "2026-11-05" } },
		});
	});
	it("edits an existing property (found ignoring capitals) and keeps the rest", () => {
		const props = {
			due: { type: "date", value: null, note: "kept" },
			Other: { type: "text", value: "x" },
		};
		const made = applyAnswer(props, due, "2026-11-05");
		expect(made).toEqual({
			ok: true,
			props: {
				due: { type: "date", value: "2026-11-05", note: "kept" },
				Other: { type: "text", value: "x" },
			},
		});
	});
	it("refuses a value that doesn't fit the property", () => {
		const made = applyAnswer(
			{ Due: { type: "date", value: null } },
			due,
			"someday",
		);
		expect(made.ok).toBe(false);
	});
	it("shows empty for a missing property and the property's own control otherwise", () => {
		expect(fieldView({}, due)).toMatchObject({ kind: "value", type: "date" });
		expect(
			fieldView({ Due: { type: "text", value: "soon" } }, due),
		).toMatchObject({ kind: "value", type: "text", value: "soon" });
		expect(fieldView({ Due: { type: "mystery", value: 1 } }, due)).toEqual({
			kind: "kept",
		});
	});
	it("turns a typed select answer into its first choice", () => {
		const made = applyAnswer({}, { name: "Status", type: "select" }, "Open");
		expect(made).toEqual({
			ok: true,
			props: { Status: { type: "select", value: "Open", options: ["Open"] } },
		});
	});
});

describe("create mode", () => {
	const fields = [
		{ name: "Title", type: "text" as const },
		{ name: "Due", type: "date" as const },
		{ name: "Done", type: "checkbox" as const },
		{ name: "Tags", type: "list" as const },
	];
	it("keeps only answers that say something, and every checkbox", () => {
		expect(
			answersToProps(fields, { Title: "Essay", Due: null, Tags: [] }),
		).toEqual({
			Title: { type: "text", value: "Essay" },
			Done: { type: "checkbox", value: false },
		});
	});
	it("titles the note from a Title or Name field, else the first text answer", () => {
		expect(titleFromAnswers(fields, { Title: " Essay " })).toBe("Essay");
		expect(
			titleFromAnswers([{ name: "Topic", type: "text" }], { Topic: "Cats" }),
		).toBe("Cats");
		expect(titleFromAnswers(fields, {})).toBe("");
	});
	const template: Note = {
		header: {
			format: "vaultops-note",
			v: 1,
			noteId: "t",
			props: { Course: { type: "text", value: "From template" } },
		},
		blocks: [
			{
				id: "a",
				type: "paragraph",
				parent: null,
				content: [{ type: "text", text: "Hello {{title}}" }],
			},
		],
	};
	it("builds a note from a template with the answers on top", () => {
		const built = buildFormNote({
			template,
			fields: [
				{ name: "Title", type: "text" },
				{ name: "course", type: "text" },
			],
			answers: { Title: "Essay", course: "History" },
			fallbackTitle: "Lecture",
		});
		expect(built.title).toBe("Essay");
		expect(built.blocks?.[0]).toMatchObject({
			content: [{ text: "Hello Essay" }],
		});
		expect(built.blocks?.[0]?.id).not.toBe("a");
		expect(built.props).toEqual({
			Title: { type: "text", value: "Essay" },
			course: { type: "text", value: "History" },
		});
		expect(template.header.props).toEqual({
			Course: { type: "text", value: "From template" },
		});
	});
	it("makes a blank note when there is no template", () => {
		const built = buildFormNote({
			template: null,
			fields,
			answers: {},
			fallbackTitle: "Untitled",
		});
		expect(built.title).toBe("Untitled");
		expect(built.blocks).toBeUndefined();
	});
});
