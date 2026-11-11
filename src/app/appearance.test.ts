import { describe, expect, it } from "vitest";
import {
	buildStyle,
	EMPTY_APPEARANCE,
	modeOf,
	normalizeHex,
	parseAppearance,
	partsOf,
	rowPaint,
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

describe("per-part styles", () => {
	it("maps every older single-colour mode to the same set of parts", () => {
		const parts = (mode: Parameters<typeof modeOf>[0]) =>
			Object.keys(partsOf(mode)).sort();
		const tone = "red" as const;
		expect(parts({ tone, mode: "icon" })).toEqual(["icon"]);
		expect(parts({ tone, mode: "text" })).toEqual(["text"]);
		expect(parts({ tone, mode: "icon-text" })).toEqual(["icon", "text"]);
		expect(parts({ tone, mode: "border" })).toEqual(["border"]);
		expect(parts({ tone, mode: "background" })).toEqual(["background"]);
		expect(parts({ tone, mode: "border-background" })).toEqual([
			"background",
			"border",
		]);
		expect(parts({ tone })).toEqual(["icon", "text"]);
		expect(partsOf({ tone, mode: "border" }).border).toEqual({ color: "red" });
	});

	it("loads an older-shape file and paints it the way it always did", () => {
		const text = JSON.stringify({
			v: 1,
			items: {
				Class: { icon: "school", tone: "blue", mode: "border-background" },
			},
			tags: {},
		});
		const style = parseAppearance(text).items.Class;
		expect(style).toEqual({
			icon: "school",
			tone: "blue",
			mode: "border-background",
		});
		const paint = rowPaint(style);
		expect(Object.keys(paint.attrs).sort()).toEqual([
			"data-paint-background",
			"data-paint-border",
		]);
		expect(paint.style["--paint-border"]).toBe("var(--tone-blue)");
		expect(paint.style["--paint-background-alpha"]).toBe("16%");
	});

	it("round-trips independent colours, hex colours and a background strength", () => {
		const item = buildStyle("rocket", {
			icon: { color: "red" },
			border: { color: "#3b82f6" },
			background: { color: "#ABC", alpha: 0.3 },
		});
		expect(item).not.toBeNull();
		const back = parseAppearance(
			serializeAppearance({ items: { A: item ?? {} }, tags: {} }),
		).items.A;
		expect(back?.parts).toEqual({
			icon: { color: "red" },
			border: { color: "#3b82f6" },
			background: { color: "#aabbcc", alpha: 0.3 },
		});
		expect(back?.icon).toBe("rocket");
	});

	it("still writes the older tone and mode when one tone covers the parts", () => {
		expect(
			buildStyle(undefined, { icon: { color: "red" }, text: { color: "red" } }),
		).toEqual({
			parts: { icon: { color: "red" }, text: { color: "red" } },
			tone: "red",
			mode: "icon-text",
		});
		const mixed = buildStyle(undefined, {
			icon: { color: "red" },
			text: { color: "blue" },
		});
		expect(mixed?.tone).toBeUndefined();
		expect(buildStyle(undefined, {})).toBeNull();
	});

	it("drops bad part colours and keeps the rest", () => {
		const out = parseAppearance(
			JSON.stringify({
				items: {
					A: { parts: { icon: { color: "nope" }, text: { color: "#fff" } } },
				},
			}),
		);
		expect(out.items.A?.parts).toEqual({ text: { color: "#ffffff" } });
	});

	it("normalises hex colours", () => {
		expect(normalizeHex("#ABC")).toBe("#aabbcc");
		expect(normalizeHex("12ab34")).toBe("#12ab34");
		expect(normalizeHex("#12")).toBeNull();
		expect(normalizeHex("#gggggg")).toBeNull();
	});
});
