import { describe, expect, it } from "vitest";
import { knownTags, sameTagAs, suggestTags, tagKey } from "./tag-suggest";

const rows = [
	{ path: "a", tags: ["school", "ADD-103"] },
	{ path: "b", tags: ["School", "work/clients"] },
	{ path: "c", tags: ["schedule", "school"] },
];

describe("tagKey", () => {
	it("ignores capitals, punctuation and spaces but keeps levels", () => {
		expect(tagKey("ADD-103")).toBe("add103");
		expect(tagKey("Add 103")).toBe("add103");
		expect(tagKey("#School")).toBe("school");
		expect(tagKey("Work/Big_Clients")).toBe("work/bigclients");
	});
});

describe("knownTags", () => {
	it("counts notes per tag, folding capitals, most used first", () => {
		expect(knownTags(rows)).toEqual([
			{ tag: "school", count: 3 },
			{ tag: "ADD-103", count: 1 },
			{ tag: "schedule", count: 1 },
			{ tag: "work/clients", count: 1 },
		]);
	});
});

describe("suggestTags", () => {
	const known = knownTags(rows);
	it("puts the near-duplicate first, then prefixes, then other matches", () => {
		expect(suggestTags(known, "add103", []).map((k) => k.tag)).toEqual([
			"ADD-103",
		]);
		expect(suggestTags(known, "sch", []).map((k) => k.tag)).toEqual([
			"school",
			"schedule",
		]);
		expect(suggestTags(known, "client", []).map((k) => k.tag)).toEqual([
			"work/clients",
		]);
	});
	it("leaves out tags the note already has and returns nothing for blank", () => {
		expect(suggestTags(known, "sch", ["School"]).map((k) => k.tag)).toEqual([
			"schedule",
		]);
		expect(suggestTags(known, "  ", [])).toEqual([]);
	});
});

describe("sameTagAs", () => {
	const known = knownTags(rows);
	it("finds a different spelling of a known tag, not the same one", () => {
		expect(sameTagAs(known, "School")?.tag).toBe("school");
		expect(sameTagAs(known, "add 103")?.tag).toBe("ADD-103");
		expect(sameTagAs(known, "school")).toBeNull();
		expect(sameTagAs(known, "new")).toBeNull();
	});
});
