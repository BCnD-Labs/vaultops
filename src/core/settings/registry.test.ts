import { expect, it, vi } from "vitest";
import {
	checkValue,
	coerceValue,
	createSettings,
	matchesQuery,
	type SettingDef,
	type SettingsStorage,
} from "./registry";

function memory(initial: Record<string, string> = {}) {
	const data = new Map(Object.entries(initial));
	const storage: SettingsStorage = {
		getItem: (k) => data.get(k) ?? null,
		setItem: (k, v) => void data.set(k, v),
		removeItem: (k) => void data.delete(k),
	};
	return { data, storage };
}

const defs = [
	{
		key: "general.confirm",
		section: "general",
		label: "Confirm first",
		type: "toggle",
		default: false,
		sparse: true,
	},
	{
		key: "editor.size",
		section: "editor",
		label: "Text size",
		description: "How large the text is.",
		type: "number",
		default: 16,
		min: 10,
		max: 30,
		keywords: ["zoom"],
		sparse: true,
	},
	{
		key: "editor.name",
		section: "editor",
		label: "Name",
		type: "text",
		default: "",
		maxLength: 5,
		sparse: true,
	},
	{
		key: "appearance.tint",
		section: "appearance",
		label: "Tint",
		type: "color",
		default: "",
		sparse: true,
	},
	{
		key: "appearance.shape",
		section: "appearance",
		label: "Shape",
		type: "select",
		default: "round",
		options: [
			{ value: "round", label: "Round" },
			{ value: "square", label: "Square" },
		],
		store: { key: "old.shape", path: ["shape"] },
	},
	{
		key: "appearance.edge",
		section: "appearance",
		label: "Edge",
		type: "font",
		default: "soft",
		options: [
			{ value: "soft", label: "Soft" },
			{ value: "hard", label: "Hard" },
		],
		store: { key: "old.shape", path: ["edge"] },
	},
	{
		key: "shortcuts.open",
		section: "shortcuts",
		label: "Open",
		type: "shortcut",
		default: "Mod+K",
		sparse: true,
	},
] as const satisfies readonly SettingDef[];

it("gives defaults for anything not stored", () => {
	const { storage } = memory();
	const s = createSettings(defs, storage);
	expect(s.get("general.confirm")).toBe(false);
	expect(s.get("editor.size")).toBe(16);
	expect(s.get("appearance.shape")).toBe("round");
	expect(s.get("shortcuts.open")).toBe("Mod+K");
});

it("sets, clamps and falls back on bad values", () => {
	const { storage } = memory();
	const s = createSettings(defs, storage);
	s.set("editor.size", 99);
	expect(s.get("editor.size")).toBe(30);
	s.set("editor.size", 2);
	expect(s.get("editor.size")).toBe(10);
	s.set("editor.name", "abcdefgh");
	expect(s.get("editor.name")).toBe("abcde");
	s.set("appearance.tint", "#ABCDEF");
	expect(s.get("appearance.tint")).toBe("#abcdef");
	s.set("appearance.shape", "hexagon" as "round");
	expect(s.get("appearance.shape")).toBe("round");
});

it("validates stored junk by falling back to the default", () => {
	const { storage } = memory({
		"vaultops.settings": JSON.stringify({
			"general.confirm": "yes",
			"editor.size": "big",
			"appearance.tint": "red",
			"shortcuts.open": 4,
		}),
		"old.shape": "not json",
	});
	const s = createSettings(defs, storage);
	expect(s.get("general.confirm")).toBe(false);
	expect(s.get("editor.size")).toBe(16);
	expect(s.get("appearance.tint")).toBe("");
	expect(s.get("shortcuts.open")).toBe("Mod+K");
	expect(s.get("appearance.shape")).toBe("round");
});

it("loads an old-shape blob under its old key and keeps unknown fields", () => {
	const { storage, data } = memory({
		"old.shape": JSON.stringify({ shape: "square", future: { a: 1 } }),
	});
	const s = createSettings(defs, storage);
	expect(s.get("appearance.shape")).toBe("square");
	expect(s.get("appearance.edge")).toBe("soft");
	s.set("appearance.edge", "hard");
	// Not sparse: both fields are written, so an older reader sees the whole shape.
	expect(JSON.parse(data.get("old.shape") ?? "")).toEqual({
		shape: "square",
		edge: "hard",
		future: { a: 1 },
	});
});

it("writes only non-default values for sparse settings and removes them on reset", () => {
	const { storage, data } = memory();
	const s = createSettings(defs, storage);
	s.set("general.confirm", true);
	expect(JSON.parse(data.get("vaultops.settings") ?? "")).toEqual({
		"general.confirm": true,
	});
	s.reset("general.confirm");
	expect(data.has("vaultops.settings")).toBe(false);
});

it("resets one section and reports defaults", () => {
	const { storage } = memory();
	const s = createSettings(defs, storage);
	s.set("editor.size", 20);
	s.set("editor.name", "x");
	s.set("general.confirm", true);
	expect(s.isDefault("editor.size")).toBe(false);
	s.resetSection("editor");
	expect(s.get("editor.size")).toBe(16);
	expect(s.get("editor.name")).toBe("");
	expect(s.get("general.confirm")).toBe(true);
});

it("tells subscribers which keys changed, until they unsubscribe", () => {
	const { storage } = memory();
	const s = createSettings(defs, storage);
	const seen = vi.fn();
	const off = s.subscribe(seen);
	s.set("editor.size", 12);
	s.resetSection("editor");
	expect(seen).toHaveBeenNthCalledWith(1, ["editor.size"]);
	expect(seen).toHaveBeenNthCalledWith(2, ["editor.size", "editor.name"]);
	off();
	s.set("editor.size", 13);
	expect(seen).toHaveBeenCalledTimes(2);
});

it("exports every value and imports it back, reporting skipped keys", () => {
	const a = createSettings(defs, memory().storage);
	a.set("editor.size", 22);
	a.set("appearance.shape", "square");
	const exported = a.exportSettings();
	expect(exported.settings["editor.size"]).toBe(22);

	const b = createSettings(defs, memory().storage);
	const report = b.importSettings(exported);
	expect(report.skipped).toEqual([]);
	expect(b.get("editor.size")).toBe(22);
	expect(b.get("appearance.shape")).toBe("square");

	const c = createSettings(defs, memory().storage);
	const bad = c.importSettings({
		settings: {
			"editor.size": 500,
			"appearance.shape": "hexagon",
			"nope.key": 1,
			"general.confirm": "yes",
		},
	});
	expect(bad.applied).toEqual(["editor.size"]);
	expect(bad.skipped.map((s) => s.key)).toEqual([
		"appearance.shape",
		"nope.key",
		"general.confirm",
	]);
	expect(c.get("editor.size")).toBe(30);
	expect(c.get("appearance.shape")).toBe("round");
	expect(c.importSettings("junk").skipped).toHaveLength(1);
});

it("searches label, description, keywords, options and section", () => {
	const s = createSettings(defs, memory().storage);
	expect(s.search("zoom").map((d) => d.key)).toEqual(["editor.size"]);
	expect(s.search("how large").map((d) => d.key)).toEqual(["editor.size"]);
	expect(s.search("square").map((d) => d.key)).toEqual(["appearance.shape"]);
	expect(s.search("appearance").map((d) => d.key)).toEqual([
		"appearance.tint",
		"appearance.shape",
		"appearance.edge",
	]);
	expect(s.search("zzz")).toEqual([]);
	expect(matchesQuery({ label: "A" }, "")).toBe(true);
});

it("rejects duplicate keys and unknown keys", () => {
	const dup = { ...defs[0] } as SettingDef;
	expect(() => createSettings([dup, dup], memory().storage)).toThrow();
	const s = createSettings(defs, memory().storage);
	// @ts-expect-error not a known key
	expect(() => s.get("nope")).toThrow();
});

it("checks each type strictly", () => {
	const get = (k: string) => defs.find((d) => d.key === k) as SettingDef;
	expect(checkValue(get("general.confirm"), 1).ok).toBe(false);
	expect(checkValue(get("editor.size"), Number.NaN).ok).toBe(false);
	expect(checkValue(get("shortcuts.open"), "Mod+Shift+P").ok).toBe(true);
	expect(checkValue(get("shortcuts.open"), "two words").ok).toBe(false);
	expect(coerceValue(get("appearance.tint"), "#12345")).toBe("");
});
