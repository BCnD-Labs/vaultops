import { describe, expect, it } from "vitest";
import { parseMaintainer } from "./maintainer";

describe("parseMaintainer", () => {
	it("is on only for an explicit true", () => {
		expect(parseMaintainer('{"maintainer": true}')).toBe(true);
		expect(parseMaintainer('{"maintainer": "yes"}')).toBe(false);
		expect(parseMaintainer('{"maintainer": false}')).toBe(false);
		expect(parseMaintainer("{}")).toBe(false);
	});

	it("is off when the file is missing or unreadable", () => {
		expect(parseMaintainer(null)).toBe(false);
		expect(parseMaintainer("")).toBe(false);
		expect(parseMaintainer("true")).toBe(false);
		expect(parseMaintainer("not json")).toBe(false);
	});
});
