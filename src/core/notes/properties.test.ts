import { describe, expect, it } from "vitest";
import { parseNote, serializeNote } from "../note-format";
import {
	addProperty,
	headerProps,
	type Props,
	readProps,
	removeProperty,
	setValue,
	withProps,
} from "./properties";

const header = (extra: Record<string, unknown> = {}) =>
	({
		format: "vaultops-note",
		v: 1,
		noteId: "n1",
		title: "T",
		...extra,
	}) as never;

function round(props: Props) {
	const text = serializeNote({
		header: withProps(header(), props),
		blocks: [],
	});
	const parsed = parseNote(text).note;
	return headerProps(parsed?.header) as Props;
}

describe("properties", () => {
	it("round-trips every type through save and reload", () => {
		let props: Props = {};
		const steps: [string, Parameters<typeof addProperty>[2], unknown][] = [
			["Summary", "text", "hello"],
			["Pages", "number", 12.5],
			["Due", "date", "2026-11-05"],
			["Done", "checkbox", true],
			["Authors", "list", ["Ann", "Bo"]],
		];
		for (const [name, type, value] of steps) {
			const added = addProperty(props, name, type);
			if (!added.ok) throw new Error(added.message);
			const set = setValue(added.props, name, value as never);
			if (!set.ok) throw new Error(set.message);
			props = set.props;
		}
		// The note format writes keys in sorted order, so compare by name.
		const back = readProps(round(props)).sort((a, b) =>
			a.name.localeCompare(b.name),
		);
		expect(back).toEqual([
			{ known: true, name: "Authors", type: "list", value: ["Ann", "Bo"] },
			{ known: true, name: "Done", type: "checkbox", value: true },
			{ known: true, name: "Due", type: "date", value: "2026-11-05" },
			{ known: true, name: "Pages", type: "number", value: 12.5 },
			{ known: true, name: "Summary", type: "text", value: "hello" },
		]);
	});

	it("new properties start empty", () => {
		const types = ["text", "number", "date", "checkbox", "list"] as const;
		const values = types.map((t) => {
			const r = addProperty({}, "X", t);
			return r.ok ? readProps(r.props)[0] : null;
		});
		expect(values.map((v) => v && v.known && v.value)).toEqual([
			"",
			null,
			null,
			false,
			[],
		]);
	});

	it("keeps property types and fields this version does not know, byte for byte", () => {
		const props: Props = {
			Status: {
				type: "select",
				value: "Open",
				options: [{ name: "Open", color: "red" }],
			},
			Weird: { type: "text", value: 5 },
			Bare: "just a string",
			Rating: { type: "number", value: 4, unit: "stars" },
		};
		expect(readProps(props)).toEqual([
			{ known: false, name: "Status", type: "select" },
			{ known: false, name: "Weird", type: "text" },
			{ known: false, name: "Bare", type: null },
			{ known: true, name: "Rating", type: "number", value: 4 },
		]);
		// Edit one known property and add another: the rest is untouched.
		const edited = setValue(props, "Rating", 5);
		if (!edited.ok) throw new Error(edited.message);
		const added = addProperty(edited.props, "Note", "text");
		if (!added.ok) throw new Error(added.message);
		const out = round(added.props);
		expect(out["Status"]).toEqual(props["Status"]);
		expect(out["Weird"]).toEqual(props["Weird"]);
		expect(out["Bare"]).toBe("just a string");
		expect(out["Rating"]).toEqual({ type: "number", value: 5, unit: "stars" });
	});

	it("refuses a value that does not fit, and unknown types", () => {
		const base = {
			A: { type: "number", value: 1 },
			S: { type: "select", value: "x" },
		} as Props;
		expect(setValue(base, "A", "abc").ok).toBe(false);
		expect(setValue(base, "A", Number.NaN).ok).toBe(false);
		expect(setValue(base, "S", "y").ok).toBe(false);
		expect(
			setValue({ D: { type: "date", value: null } }, "D", "2026-02-30").ok,
		).toBe(false);
		expect(
			setValue({ D: { type: "date", value: null } }, "D", "2026-02-28").ok,
		).toBe(true);
		expect(
			setValue({ L: { type: "list", value: [] } }, "L", [1] as never).ok,
		).toBe(false);
	});

	it("names are cleaned and unique ignoring capital letters", () => {
		const a = addProperty({}, "  Due   date ", "date");
		expect(a.ok && Object.keys(a.props)).toEqual(["Due date"]);
		if (!a.ok) return;
		expect(addProperty(a.props, "due DATE", "text").ok).toBe(false);
		expect(addProperty({}, "   ", "text").ok).toBe(false);
		expect(addProperty({}, "Tags", "text").ok).toBe(false);
		expect(addProperty({}, "Tags", "list").ok).toBe(true);
	});

	it("removes any property, including unknown ones, and leaves the rest", () => {
		const props: Props = {
			A: { type: "select", value: "x" },
			B: { type: "text", value: "" },
		};
		expect(removeProperty(props, "A")).toEqual({
			B: { type: "text", value: "" },
		});
	});

	it("leaves no props key when empty, and keeps the other header fields", () => {
		const h = header({
			custom: [1, 2],
			props: { A: { type: "text", value: "" } },
		});
		const out = withProps(h, {});
		expect("props" in out).toBe(false);
		expect(out["custom"]).toEqual([1, 2]);
		expect(out.noteId).toBe("n1");
	});

	it("tells an unreadable props field from a missing one", () => {
		expect(headerProps(header())).toEqual({});
		expect(headerProps(header({ props: "oops" }))).toBeNull();
		expect(headerProps(header({ props: [1] }))).toBeNull();
		expect(headerProps(undefined)).toEqual({});
	});
});
