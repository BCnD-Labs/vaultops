import { expect, it } from "vitest";
import {
	createSettings,
	type SettingsStorage,
} from "../core/settings/registry";
import { checkInConfig, SETTING_DEFS, weekStartsOnValue } from "./settings";

function memory(initial: Record<string, string> = {}) {
	const data = new Map(Object.entries(initial));
	const storage: SettingsStorage = {
		getItem: (k) => data.get(k) ?? null,
		setItem: (k, v) => void data.set(k, v),
		removeItem: (k) => void data.delete(k),
	};
	return { data, registry: createSettings(SETTING_DEFS, storage) };
}

it("loads the calendar choices saved before the registry existed", () => {
	const { registry } = memory({
		"vaultops:calendar-button": "0",
		"vaultops:calendar-dock": "right",
	});
	expect(registry.get("appearance.calendarPlacement")).toBe("sidebar");
	expect(registry.get("appearance.calendarDock")).toBe("right");
});

it("defaults when nothing, or the retired left dock, is saved", () => {
	const { registry } = memory({ "vaultops:calendar-dock": "left" });
	expect(registry.get("appearance.calendarPlacement")).toBe("titlebar");
	expect(registry.get("appearance.calendarDock")).toBe("planner");
});

it("writes the old shape back: 1 or 0, and the bare dock name", () => {
	const { registry, data } = memory();
	registry.set("appearance.calendarPlacement", "sidebar");
	registry.set("appearance.calendarDock", "right");
	expect(data.get("vaultops:calendar-button")).toBe("0");
	expect(data.get("vaultops:calendar-dock")).toBe("right");
	registry.set("appearance.calendarPlacement", "titlebar");
	expect(data.get("vaultops:calendar-button")).toBe("1");
});

it("includes calendar placement in search, export, import and section reset", () => {
	const { registry, data } = memory({ "vaultops:calendar-button": "0" });
	expect(registry.search("title bar").map((d) => d.key)).toContain(
		"appearance.calendarPlacement",
	);
	expect(registry.search("monday").map((d) => d.key)).toContain(
		"planner.weekStartsOn",
	);
	expect(registry.exportSettings().settings).toMatchObject({
		"appearance.calendarPlacement": "sidebar",
		"planner.weekStartsOn": "sunday",
	});
	const report = registry.importSettings({
		"appearance.calendarPlacement": "titlebar",
		"appearance.calendarDock": "left",
	});
	expect(report.applied).toEqual(["appearance.calendarPlacement"]);
	expect(report.skipped.map((s) => s.key)).toEqual(["appearance.calendarDock"]);
	expect(data.get("vaultops:calendar-button")).toBe("1");
	registry.set("appearance.calendarPlacement", "sidebar");
	registry.set("appearance.calendarDock", "right");
	registry.resetSection("interface");
	expect(registry.get("appearance.calendarPlacement")).toBe("titlebar");
	expect(registry.get("appearance.calendarDock")).toBe("planner");
});

it("week starts on Sunday by default and maps Monday to 1", () => {
	const { registry } = memory();
	expect(weekStartsOnValue(registry.get("planner.weekStartsOn"))).toBe(0);
	registry.set("planner.weekStartsOn", "monday");
	expect(weekStartsOnValue(registry.get("planner.weekStartsOn"))).toBe(1);
});

it("check-in settings default to all slots on at 05:00, 12:00 and 17:00, stored sparsely", () => {
	const { registry, data } = memory();
	expect(registry.get("planner.checkIn.morning")).toBe(true);
	expect(registry.get("planner.checkIn.afternoon")).toBe(true);
	expect(registry.get("planner.checkIn.evening")).toBe(true);
	expect(registry.get("planner.checkIn.morningStart")).toBe("05:00");
	expect(registry.get("planner.checkIn.afternoonStart")).toBe("12:00");
	expect(registry.get("planner.checkIn.eveningStart")).toBe("17:00");
	expect(
		checkInConfig({
			"planner.checkIn.morning": true,
			"planner.checkIn.morningStart": "05:00",
			"planner.checkIn.afternoon": true,
			"planner.checkIn.afternoonStart": "12:00",
			"planner.checkIn.evening": true,
			"planner.checkIn.eveningStart": "17:00",
		}).starts.evening,
	).toBe("17:00");
	registry.set("planner.checkIn.afternoon", false);
	registry.set("planner.checkIn.eveningStart", "18:30");
	const stored = JSON.parse(data.get("vaultops.settings") ?? "{}");
	expect(stored).toMatchObject({
		"planner.checkIn.afternoon": false,
		"planner.checkIn.eveningStart": "18:30",
	});
	expect(
		Object.keys(stored).filter((k) => k.startsWith("planner.checkIn.")),
	).toEqual(["planner.checkIn.afternoon", "planner.checkIn.eveningStart"]);
	registry.reset("planner.checkIn.afternoon");
	registry.reset("planner.checkIn.eveningStart");
	expect(
		Object.keys(JSON.parse(data.get("vaultops.settings") ?? "{}")).filter((k) =>
			k.startsWith("planner.checkIn."),
		),
	).toEqual([]);
});

it("check-in times only accept the listed times and are found in search", () => {
	const { registry } = memory();
	expect(registry.set("planner.checkIn.morningStart", "07:30")).toBe("07:30");
	expect(registry.set("planner.checkIn.morningStart", "07:15")).toBe("05:00");
	expect(registry.search("check-in").length).toBeGreaterThanOrEqual(6);
});
