import { describe, expect, it } from "vitest";
import { mergeWords } from "./word-merge";

describe("mergeWords", () => {
	it("combines edits to different words", () => {
		expect(
			mergeWords(
				"The quick fox jumps over the dog.",
				"The quick brown fox jumps over the dog.",
				"The quick fox jumps over the lazy dog.",
			),
		).toBe("The quick brown fox jumps over the lazy dog.");
		expect(mergeWords("one two three", "ONE two three", "one two THREE")).toBe(
			"ONE two THREE",
		);
	});

	it("takes the side that changed, and an edit both made once", () => {
		expect(mergeWords("a b", "a b", "a c")).toBe("a c");
		expect(mergeWords("a b", "a c", "a b")).toBe("a c");
		expect(mergeWords("a b c", "a X c", "a X c")).toBe("a X c");
	});

	it("gives up when both changed the same words or added at the same spot", () => {
		expect(
			mergeWords("I like tea", "I like coffee", "I like water"),
		).toBeNull();
		expect(
			mergeWords("start end", "start mine end", "start theirs end"),
		).toBeNull();
		// Edits that touch each other count as the same spot: both versions are kept.
		expect(mergeWords("a b", "a", "a b c d")).toBeNull();
	});
});
