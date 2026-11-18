import { describe, expect, it } from "vitest";
import { createSearchIndex } from "./index";

describe("in-memory search index", () => {
	it("folds accents and case, and matches word prefixes", () => {
		const index = createSearchIndex();
		index.add({ path: "a", title: "Café Plans", text: "Tomorrow" });
		expect(index.search("CAFE plan").map((hit) => hit.path)).toEqual(["a"]);
	});
	it("matches words in any order, tolerates one long-word typo, and requires every word", () => {
		const index = createSearchIndex();
		index.add({ path: "a", title: "", text: "The searchable paragraph" });
		expect(index.search("paragrph search").map((hit) => hit.path)).toEqual([
			"a",
		]);
		expect(index.search("paragraph missing")).toEqual([]);
	});
	it("matches query words spread across the title, tags and body", () => {
		const index = createSearchIndex();
		index.add({
			path: "a",
			title: "March budget",
			text: "groceries and rent",
			tags: ["finance"],
		});
		expect(index.search("budget rent finance").map((hit) => hit.path)).toEqual([
			"a",
		]);
		const [hit] = index.search("budget rent");
		expect(hit?.field).toBe("title");
		expect(index.search("budget missing")).toEqual([]);
	});
	it("requires quoted phrases and prefers titles, then headings, tags and body", () => {
		const index = createSearchIndex();
		index.add({ path: "body", title: "", text: "alpha beta" });
		index.add({ path: "tag", title: "", text: "", tags: ["alpha beta"] });
		index.add({
			path: "property",
			title: "",
			text: "",
			properties: ["alpha beta"],
		});
		index.add({
			path: "heading",
			title: "",
			text: "",
			headings: ["alpha beta"],
		});
		index.add({ path: "title", title: "alpha beta" });
		expect(index.search('"alpha beta"').map((hit) => hit.path)).toEqual([
			"title",
			"heading",
			"tag",
			"property",
			"body",
		]);
		expect(index.search('"beta alpha"')).toEqual([]);
	});
	it("updates and removes one note without disturbing the rest", () => {
		const index = createSearchIndex();
		index.add({ path: "a", title: "first" });
		index.add({ path: "b", title: "first" });
		index.add({ path: "a", title: "second" });
		index.remove("b");
		expect(index.search("first")).toEqual([]);
		expect(index.search("second").map((hit) => hit.path)).toEqual(["a"]);
	});
	it("uses recency to break equivalent matches and returns snippets and ranges", () => {
		const index = createSearchIndex();
		index.add({
			path: "old",
			title: "",
			text: "A useful searchable paragraph",
			updatedAt: 1,
		});
		index.add({
			path: "new",
			title: "",
			text: "A useful searchable paragraph",
			updatedAt: 2,
		});
		const [hit] = index.search("search");
		expect(hit?.path).toBe("new");
		expect(hit?.snippet).toContain("searchable");
		expect(hit?.snippet.slice(...(hit?.ranges[0] ?? [0, 0]))).toBe(
			"searchable",
		);
	});
	it("builds and searches an index for 10,000 short notes", () => {
		const started = performance.now();
		const index = createSearchIndex();
		for (let i = 0; i < 10_000; i++)
			index.add({
				path: `note-${i}`,
				title: `Note ${i}`,
				text: "common vault search target",
			});
		expect(index.search("target")).toHaveLength(10_000);
		expect(performance.now() - started).toBeLessThan(5_000);
	});
});
