import { describe, expect, it } from "vitest";
import { buildTagTree, isUnderTag, tagSegments } from "./tag-tree";
import { cleanTag, notesWithTag } from "./tags";

const rows = (...lists: string[][]) =>
	lists.map((tags, i) => ({ path: `${i}.vnote`, tags }));

describe("tag tree", () => {
	it("builds levels with counts; a parent counts each note once", () => {
		const tree = buildTagTree(
			rows(
				["work/clients/acme", "work/clients/zed"],
				["work/clients/acme"],
				["Work"],
				["idea"],
			),
		);
		expect(tree.map((n) => [n.name, n.count])).toEqual([
			["idea", 1],
			["work", 3],
		]);
		const work = tree[1];
		expect(work?.children.map((n) => [n.path, n.count])).toEqual([
			["work/clients", 2],
		]);
		expect(work?.children[0]?.children.map((n) => [n.name, n.count])).toEqual([
			["acme", 2],
			["zed", 1],
		]);
	});

	it("keeps flat tags flat, matching ignoring capitals", () => {
		const tree = buildTagTree(rows(["Idea"], ["idea"], []));
		expect(tree).toEqual([
			{ name: "Idea", path: "Idea", count: 2, children: [] },
		]);
	});

	it("cleans slashes in tags", () => {
		expect(cleanTag(" work / clients ")).toBe("work/clients");
		expect(cleanTag("#a//b/")).toBe("a/b");
		expect(cleanTag("/a")).toBe("a");
		expect(cleanTag("/ / ")).toBeNull();
		expect(cleanTag("project x")).toBe("project x");
		expect(tagSegments("a/b")).toEqual(["a", "b"]);
	});

	it("a parent tag matches itself and its descendants, not look-alikes", () => {
		const list = rows(["work"], ["Work/clients"], ["workshop"], ["a/work"]);
		expect(notesWithTag(list, "WORK").map((r) => r.path)).toEqual([
			"0.vnote",
			"1.vnote",
		]);
		expect(isUnderTag("work/x", "work")).toBe(true);
		expect(isUnderTag("workshop", "work")).toBe(false);
	});
});
