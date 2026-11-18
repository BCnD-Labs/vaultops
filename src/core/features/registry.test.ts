import { describe, expect, it } from "vitest";
import {
	FEATURE_GROUPS,
	FEATURES,
	featureSettingKey,
	isEnabled,
	slashItemEnabled,
	switchable,
	withFeature,
} from "./registry";

describe("feature list", () => {
	it("has unique ids and only known groups", () => {
		expect(new Set(FEATURES.map((f) => f.id)).size).toBe(FEATURES.length);
		for (const f of FEATURES) expect(FEATURE_GROUPS).toContain(f.group);
	});

	it("gives every feature a name and a description", () => {
		for (const f of FEATURES) {
			expect(f.name).not.toBe("");
			expect(f.description).not.toBe("");
		}
	});

	it("lists every non-core feature under exactly one group", () => {
		const listed = FEATURE_GROUPS.flatMap((g) => switchable(g));
		expect(listed.map((f) => f.id).sort()).toEqual(
			FEATURES.filter((f) => !f.core)
				.map((f) => f.id)
				.sort(),
		);
	});
});

describe("isEnabled", () => {
	it("uses the default when nothing is stored", () => {
		expect(isEnabled("canvas", {})).toBe(true);
	});

	it("uses the stored choice", () => {
		expect(isEnabled("canvas", { canvas: false })).toBe(false);
		expect(isEnabled("canvas", { canvas: true })).toBe(true);
	});

	it("ignores a stored value that is not on or off", () => {
		expect(isEnabled("canvas", { canvas: "no" as unknown as boolean })).toBe(
			true,
		);
	});

	it("treats an undeclared id as on", () => {
		expect(isEnabled("not-a-feature", {})).toBe(true);
		expect(isEnabled("not-a-feature", { "not-a-feature": false })).toBe(true);
	});
});

describe("withFeature", () => {
	it("switches one feature without changing the input", () => {
		const before = { canvas: true };
		const after = withFeature(before, "canvas", false);
		expect(after).toEqual({ canvas: false });
		expect(before).toEqual({ canvas: true });
	});

	it("keeps ids it does not know", () => {
		const after = withFeature({ future: false }, "math", false);
		expect(after).toEqual({ future: false, math: false });
		expect(isEnabled("math", after)).toBe(false);
	});
});

it("names the settings key by feature id", () => {
	expect(featureSettingKey("math")).toBe("features.math");
});

describe("slashItemEnabled", () => {
	it("hides math and database items when their feature is off", () => {
		expect(slashItemEnabled("math", { math: false })).toBe(false);
		expect(slashItemEnabled("database", { "database-blocks": false })).toBe(
			false,
		);
	});

	it("keeps the other items", () => {
		expect(slashItemEnabled("heading-1", { math: false })).toBe(true);
		expect(slashItemEnabled("math", {})).toBe(true);
	});
});
