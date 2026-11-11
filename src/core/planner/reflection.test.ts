import { describe, expect, it } from "vitest";
import { type Note, parseNote, serializeNote } from "../note-format";
import {
	addItem,
	applyReflection,
	emptyReflection,
	normalize,
	readReflection,
	reflectionPreview,
	reflectionProblem,
	removeItem,
	setItem,
	unchanged,
} from "./reflection";
import { newTaskNote, patchTask, taskFromNote } from "./task-note";

const T1 = new Date("2026-11-09T10:00:00Z");
const T2 = new Date("2026-11-09T12:00:00Z");

const task = (): Note => {
	const n = newTaskNote({ title: "Read", number: 1, now: T1 });
	return {
		header: n.header as Note["header"],
		blocks: n.blocks ?? [],
	};
};
const reflected = (n: Note) =>
	taskFromNote("Planner/Read.vnote", n)?.reflectedAt;

describe("reflection draft edits", () => {
	it("adds, sets and removes items", () => {
		let d = addItem(emptyReflection(), "difficulty");
		expect(d.items).toEqual({ difficulty: "" });
		d = setItem(d, "difficulty", "Hard");
		expect(removeItem(d, "difficulty").items).toEqual({});
		expect(addItem(d, "difficulty")).toBe(d);
	});
	it("ignores added-but-empty items when normalizing", () => {
		const d = setItem(
			addItem(emptyReflection(), "blocker"),
			"outcome",
			" As expected ",
		);
		expect(normalize(d).items).toEqual({ outcome: "As expected" });
	});
	it("previews and validates", () => {
		const d = {
			items: { difficulty: "Easy", blocker: "Docs" },
			notes: "ok",
		};
		expect(reflectionPreview(d)).toBe("Easy · 2 notes");
		expect(reflectionPreview(emptyReflection())).toBe("Empty reflection");
		expect(
			reflectionProblem({ items: {}, notes: "x".repeat(20001) }),
		).toBeTruthy();
		expect(reflectionProblem(d)).toBeUndefined();
	});
});

describe("applyReflection", () => {
	it("stores items as text properties, a timestamp and a Reflection section", () => {
		const out = applyReflection(
			task(),
			{
				items: {
					difficulty: "Hard",
					timeSpent: "2 h+",
					blocker: "Unclear spec",
				},
				notes: "Line one\n\nLine two",
			},
			T1,
		);
		const props = out.header.props as Record<string, unknown>;
		expect(props.Difficulty).toEqual({
			type: "select",
			value: "Hard",
			options: ["Easy", "Moderate", "Hard"],
		});
		expect(props["Time spent"]).toMatchObject({
			type: "select",
			value: "2 h+",
		});
		expect(props.Blocker).toEqual({ type: "text", value: "Unclear spec" });
		expect(props.Reflected).toEqual({ type: "text", value: T1.toISOString() });
		const tail = out.blocks.slice(-3);
		expect(tail[0]?.type).toBe("heading");
		expect(tail[0]?.attrs).toEqual({ level: 2 });
		expect(readReflection(out)).toEqual({
			items: { difficulty: "Hard", timeSpent: "2 h+", blocker: "Unclear spec" },
			notes: "Line one\nLine two",
		});
		expect(reflected(out)).toBe(T1.toISOString());
	});

	it("does not bump the timestamp for an unchanged draft", () => {
		const first = applyReflection(
			task(),
			{ items: { outcome: "As expected" }, notes: "n" },
			T1,
		);
		const again = applyReflection(first, readReflection(first), T2);
		expect(again).toBe(first);
		const padded = applyReflection(
			first,
			{ items: { outcome: " As expected ", blocker: "" }, notes: "n\n\n" },
			T2,
		);
		expect(padded).toBe(first);
		expect(
			unchanged(
				{ items: { outcome: "As expected" }, notes: "n" },
				readReflection(first),
			),
		).toBe(true);
	});

	it("bumps it on a real change and keeps one section", () => {
		const first = applyReflection(task(), { items: {}, notes: "a" }, T1);
		const second = applyReflection(
			first,
			{ items: { difficulty: "Easy" }, notes: "b" },
			T2,
		);
		expect(reflected(second)).toBe(T2.toISOString());
		expect(second.blocks.filter((b) => b.type === "heading")).toHaveLength(1);
		expect(readReflection(second).notes).toBe("b");
	});

	it("an empty draft over nothing changes nothing; over a reflection it removes it", () => {
		const base = task();
		expect(applyReflection(base, emptyReflection(), T1)).toBe(base);
		const first = applyReflection(
			base,
			{ items: { difficulty: "Easy" }, notes: "a" },
			T1,
		);
		const cleared = applyReflection(first, emptyReflection(), T2);
		expect(reflected(cleared)).toBeUndefined();
		expect(cleared.blocks.some((b) => b.type === "heading")).toBe(false);
		expect(cleared.header.props).toEqual(base.header.props);
	});

	it("keeps other properties, the description and other blocks in the section", () => {
		const base = patchTask(task(), {
			status: "closed",
			starred: true,
			now: T1,
		});
		const withDesc: Note = {
			...base,
			blocks: [
				{
					id: "p0",
					type: "paragraph",
					parent: null,
					content: [{ type: "text", text: "Description" }],
				},
				{
					id: "h",
					type: "heading",
					parent: null,
					attrs: { level: 2 },
					content: [{ type: "text", text: "Reflection" }],
				},
				{
					id: "p1",
					type: "paragraph",
					parent: null,
					content: [{ type: "text", text: "old" }],
				},
				{ id: "d1", type: "divider", parent: null },
				{
					id: "h2",
					type: "heading",
					parent: null,
					attrs: { level: 2 },
					content: [{ type: "text", text: "After" }],
				},
			],
		};
		const out = applyReflection(withDesc, { items: {}, notes: "new" }, T1);
		expect(out.blocks.map((b) => b.type)).toEqual([
			"paragraph",
			"heading",
			"paragraph",
			"divider",
			"heading",
		]);
		expect(readReflection(out).notes).toBe("new");
		const t = taskFromNote("p", out);
		expect(t?.status).toBe("closed");
		expect(t?.starred).toBe(true);
	});

	it("survives a save and reload", () => {
		const out = applyReflection(
			task(),
			{ items: { help: "None" }, notes: "x" },
			T1,
		);
		const parsed = parseNote(serializeNote(out));
		expect(parsed.problems).toEqual([]);
		expect(parsed.note && readReflection(parsed.note)).toEqual({
			items: { help: "None" },
			notes: "x",
		});
	});
});

describe("older task notes", () => {
	it("an old-shape task note (no reflection) loads unchanged", () => {
		const old: Note = {
			header: {
				format: "vaultops-note",
				v: 1,
				noteId: "n1",
				title: "Old",
				props: {
					Kind: { type: "text", value: "task" },
					Status: { type: "text", value: "closed" },
					Number: { type: "number", value: 4 },
					Closed: { type: "text", value: "2026-10-01T00:00:00.000Z" },
					Difficulty: { type: "select", value: "Hard" },
				},
			},
			blocks: [{ id: "a", type: "paragraph", parent: null }],
		};
		const t = taskFromNote("Planner/Old.vnote", old);
		expect(t?.status).toBe("closed");
		expect(t?.reflectedAt).toBeUndefined();
		expect(readReflection(old).items).toEqual({ difficulty: "Hard" });
		const out = applyReflection(
			old,
			{ items: { difficulty: "Easy" }, notes: "" },
			T1,
		);
		expect((out.header.props as Record<string, unknown>).Difficulty).toEqual({
			type: "select",
			value: "Easy",
			options: ["Easy", "Moderate", "Hard"],
		});
	});

	it("reads the old text form and upgrades it only on the next save", () => {
		const old: Note = {
			header: {
				format: "vaultops-note",
				v: 1,
				noteId: "n2",
				title: "Old text",
				props: {
					Difficulty: { type: "text", value: "Hard" },
					Blocker: { type: "text", value: "Spec" },
				},
			},
			blocks: [],
		};
		expect(readReflection(old).items).toEqual({
			difficulty: "Hard",
			blocker: "Spec",
		});
		// Nothing changed: the very same note, still text.
		expect(applyReflection(old, readReflection(old), T2)).toBe(old);
		const out = applyReflection(
			old,
			{ items: { difficulty: "Hard", blocker: "Spec" }, notes: "x" },
			T2,
		);
		const p = out.header.props as Record<string, unknown>;
		expect(p.Difficulty).toMatchObject({ type: "select", value: "Hard" });
		expect(p.Blocker).toEqual({ type: "text", value: "Spec" });
	});

	it("keeps a user's own options and adds a value that is missing", () => {
		const n: Note = {
			header: {
				format: "vaultops-note",
				v: 1,
				noteId: "n3",
				title: "Own",
				props: {
					Outcome: { type: "select", value: "Meh", options: ["Meh", "Good"] },
				},
			},
			blocks: [],
		};
		const out = applyReflection(
			n,
			{ items: { outcome: "Great" }, notes: "" },
			T2,
		);
		expect((out.header.props as Record<string, unknown>).Outcome).toEqual({
			type: "select",
			value: "Great",
			options: ["Meh", "Good", "Great"],
		});
	});
});
