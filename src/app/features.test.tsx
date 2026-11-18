// @vitest-environment happy-dom
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { FEATURES, featureSettingKey } from "../core/features/registry";
import { MemoryHost } from "../host/memory-host";
import { filterCommands } from "./commands";
import { NoteTools } from "./NoteTools";
import { SettingsScreen } from "./SettingsScreen";
import { settings } from "./settings";
import { featureEnabled, useFeature } from "./useFeature";

const set = (id: string, on: boolean) =>
	(settings.set as (key: string, value: unknown) => unknown)(
		featureSettingKey(id),
		on,
	);

afterEach(() => {
	cleanup();
	for (const f of FEATURES) set(f.id, f.defaultOn);
	localStorage.clear();
});

const saved = () =>
	JSON.parse(localStorage.getItem("vaultops.settings") ?? "{}");

it("starts with every feature on, and saves only what is switched off", () => {
	for (const f of FEATURES) expect(featureEnabled(f.id)).toBe(true);
	set("canvas", false);
	expect(featureEnabled("canvas")).toBe(false);
	expect(saved()["features.canvas"]).toBe(false);
	set("canvas", true);
	expect(saved()["features.canvas"]).toBeUndefined();
});

it("keeps stored feature ids it does not know", () => {
	localStorage.setItem(
		"vaultops.settings",
		JSON.stringify({ "features.future": false }),
	);
	set("math", false);
	expect(saved()["features.future"]).toBe(false);
	expect(saved()["features.math"]).toBe(false);
});

it("redraws a component when a feature is switched", () => {
	render(<Probe />);
	expect(screen.getByText("planner on")).toBeTruthy();
	act(() => set("planner", false));
	expect(screen.getByText("planner off")).toBeTruthy();
});

it("hides the manager commands while their feature is off", () => {
	const context = {
		onNewFolder: vi.fn(),
		onToggle: vi.fn(),
		onNavigate: vi.fn(),
		onOpenTemplates: vi.fn(),
		onOpenResources: vi.fn(),
	};
	const ids = (state: Record<string, boolean>) =>
		filterCommands("", context, state).map((c) => c.id);
	expect(ids({})).toEqual(
		expect.arrayContaining(["open-templates", "open-resources"]),
	);
	expect(ids({ templates: false })).not.toContain("open-templates");
	expect(ids({ resources: false })).not.toContain("open-resources");
	expect(ids({ resources: false })).toContain("open-templates");
});

function Probe() {
	return <p>{useFeature("planner") ? "planner on" : "planner off"}</p>;
}

const tools = (
	<NoteTools
		hasNote
		props={null}
		editable
		onChange={() => {}}
		onOpenTag={() => {}}
	/>
);

it("drops a disabled Note tools tab, and falls back when it was the remembered one", async () => {
	localStorage.setItem("vaultops:note-tools-tab", "outline");
	render(tools);
	expect(screen.getByRole("tab", { name: "Outline" })).toBeTruthy();
	act(() => set("tab-outline", false));
	expect(screen.queryByRole("tab", { name: "Outline" })).toBeNull();
	// The first tab still shown (Properties) takes over.
	expect(
		screen.getByRole("tab", { name: "Properties" }).getAttribute("data-state"),
	).toBe("active");
	expect(screen.getByRole("tab", { name: "Connections" })).toBeTruthy();
});

it("lists the features by group on the Features page, finds them in search and switches them", async () => {
	const user = userEvent.setup();
	render(<SettingsScreen host={new MemoryHost()} />);
	await user.click(screen.getByRole("button", { name: "Features" }));
	for (const group of ["Writing", "Organising", "Planning", "Visual"])
		expect(screen.getByRole("heading", { name: group })).toBeTruthy();
	await user.click(screen.getByRole("switch", { name: "Canvas" }));
	expect(featureEnabled("canvas")).toBe(false);
	await user.type(
		screen.getByRole("searchbox", { name: "Search settings" }),
		"database",
	);
	expect(screen.getByRole("switch", { name: "Database blocks" })).toBeTruthy();
});
