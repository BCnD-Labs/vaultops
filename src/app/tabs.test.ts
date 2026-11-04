// @vitest-environment happy-dom
import { afterEach, expect, it } from "vitest";
import { browserTabs, closeTab, openTab, pruneTabs, renameTab } from "./tabs";

afterEach(() => localStorage.clear());

it("opens a tab once, at the end", () => {
	expect(openTab(["a"], "b")).toEqual(["a", "b"]);
	const tabs = ["a", "b"];
	expect(openTab(tabs, "a")).toBe(tabs);
});

it("closes a tab and picks the right neighbor, then the left, then nothing", () => {
	expect(closeTab(["a", "b", "c"], "b")).toEqual({
		tabs: ["a", "c"],
		next: "c",
	});
	expect(closeTab(["a", "b", "c"], "c")).toEqual({
		tabs: ["a", "b"],
		next: "b",
	});
	expect(closeTab(["a"], "a")).toEqual({ tabs: [], next: null });
	const tabs = ["a"];
	expect(closeTab(tabs, "zzz")).toEqual({ tabs, next: null });
});

it("keeps a renamed tab in place and never doubles a tab", () => {
	expect(renameTab(["a", "b", "c"], "b", "x")).toEqual(["a", "x", "c"]);
	expect(renameTab(["a", "b", "c"], "c", "a")).toEqual(["a", "b"]);
	const tabs = ["a"];
	expect(renameTab(tabs, "q", "r")).toBe(tabs);
	expect(renameTab(tabs, "a", "a")).toBe(tabs);
});

it("drops tabs for notes that are gone, except the open one", () => {
	expect(pruneTabs(["a", "b", "c"], ["a", "c"])).toEqual(["a", "c"]);
	expect(pruneTabs(["a", "b"], ["a"], "b")).toEqual(["a", "b"]);
	const tabs = ["a", "b"];
	expect(pruneTabs(tabs, ["a", "b", "c"])).toBe(tabs);
});

it("remembers tabs per vault and ignores damaged storage", () => {
	const store = browserTabs();
	expect(store.get("v")).toEqual([]);
	store.set("v", ["a", "b"]);
	expect(store.get("v")).toEqual(["a", "b"]);
	expect(store.get("other")).toEqual([]);
	localStorage.setItem("vaultops:tabs:v", "{not json");
	expect(store.get("v")).toEqual([]);
	localStorage.setItem("vaultops:tabs:v", '{"a":1}');
	expect(store.get("v")).toEqual([]);
	localStorage.setItem("vaultops:tabs:v", '["a",3,"","a","b"]');
	expect(store.get("v")).toEqual(["a", "b"]);
});
