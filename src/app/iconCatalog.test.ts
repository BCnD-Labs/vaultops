import { describe, expect, it } from "vitest";
import { parseAppearance } from "./appearance";
import {
	ICON_CATEGORIES,
	ICON_NAMES,
	LEGACY_ICON_IDS,
	pushRecentIcon,
	readRecentIcons,
	resolveIcon,
	searchIcons,
	toKebab,
} from "./iconCatalog";

describe("icon catalog", () => {
	it("holds the full lucide set by kebab-case name", () => {
		expect(ICON_NAMES.length).toBeGreaterThan(1000);
		expect(resolveIcon("folder-open")).toBeDefined();
		expect(toKebab("FolderOpen")).toBe("folder-open");
		expect(toKebab("Table2")).toBe("table-2");
	});

	it("still resolves every id the first version saved", () => {
		const old = [
			"folder",
			"folder-open",
			"file",
			"star",
			"heart",
			"bookmark",
			"book",
			"briefcase",
			"code",
			"flame",
			"lightbulb",
			"archive",
			"inbox",
			"calendar",
			"camera",
			"music",
			"coffee",
			"house",
			"flag",
			"globe",
			"school",
			"hammer",
			"leaf",
			"lock",
			"mail",
			"palette",
			"pin",
			"rocket",
			"smile",
			"sparkles",
			"tag",
			"target",
			"zap",
			"check",
		];
		for (const id of old) expect(resolveIcon(id), id).toBeDefined();
		expect(resolveIcon("school")).toBe(
			resolveIcon(LEGACY_ICON_IDS.school ?? ""),
		);
		const parsed = parseAppearance(
			JSON.stringify({ items: { A: { icon: "school" } } }),
		);
		expect(parsed.items.A?.icon).toBe("school");
		expect(
			parseAppearance(JSON.stringify({ items: { A: { icon: "no-such" } } }))
				.items,
		).toEqual({});
	});

	it("searches by name, ignoring case and dashes, and by keyword", () => {
		expect(
			searchIcons("FOLDER")
				.slice(0, 3)
				.every((n) => n.includes("folder")),
		).toBe(true);
		expect(searchIcons("folder open")).toContain("folder-open");
		expect(searchIcons("home")).toContain("house");
		expect(searchIcons("zzzzqqq")).toEqual([]);
		expect(searchIcons("", 5)).toHaveLength(5);
		expect(searchIcons("rocket")[0]).toBe("rocket");
	});

	it("only lists category icons that exist", () => {
		for (const c of ICON_CATEGORIES) {
			const present = c.names.filter((n) => resolveIcon(n));
			expect(present.length, c.id).toBeGreaterThan(c.names.length * 0.6);
		}
	});

	it("keeps recent icons newest first without repeats", () => {
		const mem: Record<string, string> = {};
		const storage = {
			getItem: (k: string) => mem[k] ?? null,
			setItem: (k: string, v: string) => {
				mem[k] = v;
			},
		};
		pushRecentIcon("star", storage);
		pushRecentIcon("rocket", storage);
		pushRecentIcon("star", storage);
		expect(readRecentIcons(storage)).toEqual(["star", "rocket"]);
	});
});
