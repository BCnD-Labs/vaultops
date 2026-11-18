import { expect, it } from "vitest";
import { WordIndex } from "./index";

it("ranks current words, frequency and length, folds accents and adapts casing", () => {
	const index = new WordIndex();
	index.update(
		"a",
		"completion completion compact company caféine 1234 cat",
		"Complete guide",
	);
	index.update("b", "companion");
	expect(index.suggest("com", "b")).toEqual([
		"companion",
		"completion",
		"compact",
		"company",
		"Complete guide",
	]);
	expect(index.suggest("Caf", "b")).toEqual(["Caféine"]);
	expect(index.suggest("company", "b")).toEqual([]);
	expect(index.suggest("co", "b")).toEqual([]);
	index.update("b", "compare");
	expect(index.suggest("com", "b")[0]).toBe("compare");
	expect(index.suggest("com", "b")).not.toContain("companion");
});
