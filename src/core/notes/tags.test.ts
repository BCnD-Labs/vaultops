import { describe, expect, it } from "vitest";
import type { Props } from "./properties";
import {
	addTag,
	cleanTag,
	notesWithTag,
	removeTag,
	tagIndex,
	tagsOf,
} from "./tags";

const must = (r: ReturnType<typeof addTag>): Props => {
	if (!r.ok) throw new Error(r.message);
	return r.props;
};

describe("tags", () => {
	it("a tag is an entry in the list property named tags", () => {
		const props = must(addTag({}, "Idea"));
		expect(props).toEqual({ tags: { type: "list", value: ["Idea"] } });
		expect(tagsOf(props)).toEqual(["Idea"]);
	});

	it("adds, ignores repeats ignoring capitals, and removes", () => {
		let props = must(addTag({}, "idea"));
		props = must(addTag(props, "  Work "));
		props = must(addTag(props, "IDEA"));
		expect(tagsOf(props)).toEqual(["idea", "Work"]);
		props = removeTag(props, "IDEA");
		expect(tagsOf(props)).toEqual(["Work"]);
		props = removeTag(props, "Work");
		expect(tagsOf(props)).toEqual([]);
	});

	it("cleans tags: no leading #, trimmed, not empty", () => {
		expect(cleanTag("  #project  x ")).toBe("project x");
		expect(cleanTag("##")).toBeNull();
		expect(addTag({}, "  ").ok).toBe(false);
	});

	it("finds the tags property ignoring capitals and keeps its other fields", () => {
		const props: Props = { Tags: { type: "list", value: ["a"], extra: 1 } };
		const next = must(addTag(props, "b"));
		expect(next).toEqual({
			Tags: { type: "list", value: ["a", "b"], extra: 1 },
		});
	});

	it("will not turn a tags property of another type into a list", () => {
		const props: Props = { tags: { type: "text", value: "x" } };
		expect(tagsOf(props)).toEqual([]);
		expect(addTag(props, "a").ok).toBe(false);
		expect(removeTag(props, "a")).toBe(props);
	});

	it("lists the notes that carry a tag, and counts tags", () => {
		const rows = [
			{ path: "a.vnote", tags: ["Idea", "Work"] },
			{ path: "b.vnote", tags: ["idea"] },
			{ path: "c.vnote", tags: [] },
		];
		expect(notesWithTag(rows, "IDEA").map((r) => r.path)).toEqual([
			"a.vnote",
			"b.vnote",
		]);
		expect(notesWithTag(rows, "nope")).toEqual([]);
		expect(tagIndex(rows)).toEqual([
			{ tag: "Idea", count: 2 },
			{ tag: "Work", count: 1 },
		]);
	});
});
