import { describe, expect, it } from "vitest";
import {
	EMPTY_APPEARANCE,
	modeOf,
	parseAppearance,
	serializeAppearance,
	tagTone,
} from "./appearance";

describe("appearance file", () => {
	it("round-trips icons, colours, modes and tag colours", () => {
		const appearance = {
			items: { Class: { icon: "rocket", tone: "blue", mode: "border" } },
			tags: { ideas: "pink" },
		} as const;
		expect(parseAppearance(serializeAppearance(appearance))).toEqual(
			appearance,
		);
	});

	it("reads nothing, broken text and unknown values as plain, never throws", () => {
		expect(parseAppearance(null)).toEqual(EMPTY_APPEARANCE);
		expect(parseAppearance("{not json")).toEqual(EMPTY_APPEARANCE);
		expect(parseAppearance("[1,2]")).toEqual(EMPTY_APPEARANCE);
		const odd = parseAppearance(
			JSON.stringify({
				items: {
					A: { icon: "nope", tone: "chartreuse" },
					B: { icon: "star", mode: "sparkly" },
					C: 7,
				},
				tags: { Work: "teal", Bad: "plaid" },
			}),
		);
		expect(odd.items).toEqual({ B: { icon: "star" } });
		expect(odd.tags).toEqual({ work: "teal" });
	});

	it("gives an unchosen tag the same colour every time, and honours a chosen one", () => {
		expect(tagTone("Ideas", EMPTY_APPEARANCE)).toBe(
			tagTone("ideas", EMPTY_APPEARANCE),
		);
		expect(tagTone("ideas", { items: {}, tags: { ideas: "red" } })).toBe("red");
	});

	it("paints icon and text when a colour has no mode", () => {
		expect(modeOf({ tone: "red" })).toBe("icon-text");
		expect(modeOf({ tone: "red", mode: "border" })).toBe("border");
	});
});
