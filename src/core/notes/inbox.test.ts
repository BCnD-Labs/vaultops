import { describe, expect, it } from "vitest";
import type { Block, JsonValue, Note } from "../note-format";
import {
	clearProcessed,
	findInboxSections,
	inboxBlocks,
	isInboxEmpty,
	isInboxHeading,
	markProcessed,
	notesToProcess,
	processedDay,
	reconcileProcessed,
} from "./inbox";

const text = (t: string): JsonValue => [{ type: "text", text: t }];
const h = (
	id: string,
	title: string,
	level = 2,
	attrs: { [k: string]: JsonValue } = {},
	parent: string | null = null,
): Block => ({
	id,
	type: "heading",
	parent,
	attrs: { level, ...attrs },
	content: text(title),
});
const p = (id: string, t = "", parent: string | null = null): Block => ({
	id,
	type: "paragraph",
	parent,
	...(t ? { content: text(t) } : {}),
});
const note = (blocks: Block[], props?: JsonValue): Note => ({
	header: {
		format: "vaultops-note",
		v: 1,
		noteId: "n",
		title: "Note",
		...(props === undefined ? {} : { props }),
	},
	blocks,
});
const ids = (blocks: Block[]) => blocks.map((b) => b.id);

describe("finding inbox sections", () => {
	it("recognises the role and the fallback titles", () => {
		expect(isInboxHeading(h("a", "Anything", 2, { role: "inbox" }))).toBe(true);
		for (const title of ["Brain dump", "Brain Dump", "Braindump", "Inbox"]) {
			expect(isInboxHeading(h("a", title))).toBe(true);
		}
		expect(isInboxHeading(h("a", "  brain   DUMP "))).toBe(true);
		expect(isInboxHeading(h("a", "Brain dumps"))).toBe(false);
		expect(isInboxHeading(p("a", "Inbox"))).toBe(false);
	});

	it("lets an explicit other role win over the title", () => {
		expect(isInboxHeading(h("a", "Inbox", 2, { role: "flashcard" }))).toBe(
			false,
		);
	});

	it("reads a heading's text across several text nodes", () => {
		const heading: Block = {
			...h("a", ""),
			content: [
				{ type: "text", text: "In" },
				{ type: "text", text: "box" },
			],
		};
		expect(isInboxHeading(heading)).toBe(true);
	});

	it("takes the blocks up to the next heading of the same or a higher level", () => {
		const n = note([
			h("top", "Notes", 1),
			p("x", "before"),
			h("inbox", "Brain dump", 2),
			p("a", "one"),
			h("sub", "Deeper", 3),
			p("b", "two"),
			h("next", "Plan", 2),
			p("c", "after"),
		]);
		const [section] = findInboxSections(n);
		expect(ids(section?.blocks ?? [])).toEqual(["a", "sub", "b"]);
		expect(section?.level).toBe(2);
	});

	it("stops at a higher level heading and runs to the end otherwise", () => {
		const n = note([
			h("inbox", "Inbox", 2),
			p("a", "one"),
			h("up", "Top", 1),
			p("b", "no"),
		]);
		expect(ids(inboxBlocks(n))).toEqual(["a"]);
		expect(ids(inboxBlocks(note([h("inbox", "Inbox"), p("a", "x")])))).toEqual([
			"a",
		]);
	});

	it("treats a heading with no level as level 1", () => {
		const n = note([
			{ id: "i", type: "heading", parent: null, content: text("Inbox") },
			p("a", "one"),
			h("h1", "Two", 1),
			p("b", "in"),
		]);
		expect(ids(inboxBlocks(n))).toEqual(["a"]);
	});

	it("finds several sections, and none in a canvas", () => {
		const n = note([
			h("i1", "Inbox"),
			p("a", "one"),
			h("mid", "Middle"),
			h("i2", "Brain dump"),
			p("b", "two"),
		]);
		expect(findInboxSections(n)).toHaveLength(2);
		expect(ids(inboxBlocks(n))).toEqual(["a", "b"]);
		const canvas = {
			...n,
			header: { ...n.header, kind: "canvas" },
		} satisfies Note;
		expect(findInboxSections(canvas)).toEqual([]);
	});

	it("does not list a nested inbox's blocks twice", () => {
		const n = note([
			h("i1", "Inbox", 1),
			p("a", "one"),
			h("i2", "Brain dump", 2),
			p("b", "two"),
		]);
		expect(ids(inboxBlocks(n))).toEqual(["a", "i2", "b"]);
	});

	it("keeps to its own container: a heading inside a callout", () => {
		const n = note([
			{ id: "box", type: "callout", parent: null },
			h("i", "Inbox", 2, {}, "box"),
			p("a", "in the box", "box"),
			p("outside", "outside"),
		]);
		expect(ids(inboxBlocks(n))).toEqual(["a"]);
	});
});

describe("what counts as content", () => {
	it("ignores empty paragraphs and keeps order", () => {
		const n = note([
			h("i", "Inbox"),
			p("e1"),
			p("a", "one"),
			{ ...p("e2"), content: text("   ") },
			{ ...p("e3"), content: [{ type: "hardBreak" }] },
			p("b", "two"),
		]);
		expect(ids(inboxBlocks(n))).toEqual(["a", "b"]);
		expect(isInboxEmpty(n)).toBe(false);
		expect(isInboxEmpty(note([h("i", "Inbox"), p("e1"), p("e2")]))).toBe(true);
	});

	it("counts a link or a date chip as content", () => {
		const link = {
			...p("a"),
			content: [{ type: "noteLink", attrs: { label: "Other" } }],
		};
		const chip = {
			...p("b"),
			content: [{ type: "date", attrs: { date: "2026-11-18" } }],
		};
		expect(ids(inboxBlocks(note([h("i", "Inbox"), link, chip])))).toEqual([
			"a",
			"b",
		]);
	});

	it("keeps nested children with their top-level block", () => {
		const n = note([
			h("i", "Inbox"),
			{ id: "t", type: "toggle", parent: null },
			p("s", "summary", "t"),
			{ id: "list", type: "bulletList", parent: null },
			{ id: "li", type: "listItem", parent: "list" },
			p("lt", "item", "li"),
		]);
		expect(ids(inboxBlocks(n))).toEqual(["t", "list"]);
		expect(ids(findInboxSections(n)[0]?.blocks ?? [])).toEqual(["t", "list"]);
	});

	it("treats a list that holds only an empty bullet as empty", () => {
		const empty = note([
			h("i", "Inbox"),
			{ id: "list", type: "bulletList", parent: null },
			{ id: "li", type: "listItem", parent: "list" },
			p("lt", "", "li"),
		]);
		expect(isInboxEmpty(empty)).toBe(true);
		const filled = note([
			h("i", "Inbox"),
			{ id: "list", type: "bulletList", parent: null },
			{ id: "li", type: "listItem", parent: "list" },
			p("lt", "", "li"),
			{ id: "li2", type: "listItem", parent: "list" },
			p("lt2", "real", "li2"),
		]);
		expect(isInboxEmpty(filled)).toBe(false);
	});

	it("counts a divider and a sub-heading as content", () => {
		const divider: Block = { id: "d", type: "divider", parent: null };
		expect(isInboxEmpty(note([h("i", "Inbox"), divider]))).toBe(false);
		expect(isInboxEmpty(note([h("i", "Inbox", 2), h("s", "Sub", 3)]))).toBe(
			false,
		);
	});
});

describe("Processed property", () => {
	const day = "2026-11-18";

	it("sets and clears it without touching the input or other properties", () => {
		const props = { Due: { type: "date", value: "2026-12-01" } };
		const n = note([h("i", "Inbox")], props);
		const marked = markProcessed(n, day);
		expect(marked.header.props).toEqual({
			...props,
			Processed: { type: "date", value: day },
		});
		expect(n.header.props).toEqual(props);
		expect(processedDay(marked)).toBe(day);
		expect(clearProcessed(marked).header.props).toEqual(props);
	});

	it("drops the props key when Processed was the only property", () => {
		const cleared = clearProcessed(markProcessed(note([]), day));
		expect(cleared.header).not.toHaveProperty("props");
	});

	it("replaces an earlier date, matching the name ignoring capitals", () => {
		const n = note([], { processed: { type: "date", value: "2026-01-01" } });
		expect(markProcessed(n, day).header.props).toEqual({
			processed: { type: "date", value: day },
		});
		expect(processedDay(n)).toBe("2026-01-01");
	});

	it("never overwrites or removes a Processed of another type", () => {
		const mine = { Processed: { type: "text", value: "yes" } };
		const n = note([], mine);
		expect(markProcessed(n, day)).toBe(n);
		expect(clearProcessed(n)).toBe(n);
		expect(processedDay(n)).toBeNull();
	});

	it("leaves a note alone when its props are not an object", () => {
		const n = note([], "odd");
		expect(markProcessed(n, day)).toBe(n);
		expect(clearProcessed(n)).toBe(n);
	});

	it("clearing a note that has none returns it as it is", () => {
		const n = note([]);
		expect(clearProcessed(n)).toBe(n);
	});

	it("refuses a day that is not a date", () => {
		expect(() => markProcessed(note([]), "yesterday")).toThrow("not a date");
		expect(() => markProcessed(note([]), "2026-02-30")).toThrow("not a date");
	});
});

describe("reconcileProcessed", () => {
	const day = "2026-11-18";

	it("stamps an empty inbox and keeps an existing date", () => {
		const empty = note([h("i", "Inbox"), p("e")]);
		expect(processedDay(reconcileProcessed(empty, day))).toBe(day);
		const earlier = markProcessed(empty, "2026-11-01");
		expect(reconcileProcessed(earlier, day)).toBe(earlier);
	});

	it("stamps a date property that is set but empty", () => {
		const n = note([h("i", "Inbox")], {
			Processed: { type: "date", value: null },
		});
		expect(processedDay(reconcileProcessed(n, day))).toBe(day);
	});

	it("clears Processed when the inbox has content", () => {
		const n = markProcessed(note([h("i", "Inbox"), p("a", "new")]), day);
		expect(processedDay(n)).toBe(day);
		expect(processedDay(reconcileProcessed(n, "2026-11-19"))).toBeNull();
	});

	it("leaves a note with no inbox alone, Processed or not", () => {
		const plain = note([h("a", "Plan"), p("b", "text")]);
		expect(reconcileProcessed(plain, day)).toBe(plain);
		const stamped = markProcessed(plain, "2026-11-01");
		expect(reconcileProcessed(stamped, day)).toBe(stamped);
	});

	it("is stable: running it twice changes nothing more", () => {
		const once = reconcileProcessed(note([h("i", "Inbox")]), day);
		expect(reconcileProcessed(once, "2026-12-24")).toBe(once);
	});
});

describe("notesToProcess", () => {
	const item = (
		path: string,
		blocks: Block[],
		over: { title?: string; date?: string } = {},
	) => {
		const base = note(
			blocks,
			over.date ? { Date: { type: "date", value: over.date } } : undefined,
		);
		return {
			path,
			note: { ...base, header: { ...base.header, title: over.title ?? "" } },
		};
	};
	const full = [h("i", "Inbox"), p("a", "x")];
	const empty = [h("i", "Inbox"), p("e")];

	it("lists only notes with inbox content", () => {
		const list = notesToProcess([
			item("a.vnote", full, { title: "A" }),
			item("b.vnote", empty, { title: "B" }),
			item("c.vnote", [p("z", "no inbox")], { title: "C" }),
		]);
		expect(list.map((r) => r.item.path)).toEqual(["a.vnote"]);
		expect(ids(list[0]?.blocks ?? [])).toEqual(["a"]);
	});

	it("sorts by Date, undated last, then title, then path", () => {
		const list = notesToProcess([
			item("u.vnote", full, { title: "Undated" }),
			item("n.vnote", full, { title: "New", date: "2026-11-10" }),
			item("o.vnote", full, { title: "Old", date: "2026-10-01" }),
			item("s2.vnote", full, { title: "same", date: "2026-11-10" }),
			item("s1.vnote", full, { title: "Same", date: "2026-11-10" }),
		]);
		expect(list.map((r) => r.item.path)).toEqual([
			"o.vnote",
			"n.vnote",
			"s1.vnote",
			"s2.vnote",
			"u.vnote",
		]);
	});

	it("falls back to the file name when a note has no title", () => {
		const [row] = notesToProcess([item("Journal/2026-11-18.vnote", full)]);
		expect(row?.title).toBe("2026-11-18");
	});

	it("skips canvases", () => {
		const base = item("c.vnote", full, { title: "C" });
		const canvas = {
			...base,
			note: { ...base.note, header: { ...base.note.header, kind: "canvas" } },
		};
		expect(notesToProcess([canvas])).toEqual([]);
	});
});
