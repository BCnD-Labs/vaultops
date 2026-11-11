import { describe, expect, it } from "vitest";
import { pickInitialNote } from "./last-note";

describe("pickInitialNote", () => {
	const paths = ["a.vnote", "b.vnote"];
	it("reopens the remembered note", () => {
		expect(pickInitialNote(paths, "b.vnote")).toBe("b.vnote");
	});
	it("falls back to the first note when the remembered one is gone", () => {
		expect(pickInitialNote(paths, "deleted.vnote")).toBe("a.vnote");
	});
	it("falls back to the first note when nothing is remembered", () => {
		expect(pickInitialNote(paths, null)).toBe("a.vnote");
	});
	it("is null for an empty vault", () => {
		expect(pickInitialNote([], "a.vnote")).toBeNull();
	});
});
