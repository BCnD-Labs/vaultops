import { expect, it, vi } from "vitest";
import {
	COMMAND_GROUPS,
	COMMANDS,
	filterCommands,
	groupCommands,
} from "./commands";

const context = () => ({
	onNewFolder: vi.fn(),
	onToggle: vi.fn(),
	onNavigate: vi.fn(),
});

it("has unique ids and puts every command in a known group", () => {
	expect(new Set(COMMANDS.map((c) => c.id)).size).toBe(COMMANDS.length);
	for (const c of COMMANDS) expect(COMMAND_GROUPS).toContain(c.group);
});

it("hides the reading command until the app can toggle reading", () => {
	expect(filterCommands("", context()).map((c) => c.id)).not.toContain(
		"toggle-reading",
	);
	const withReading = { ...context(), onToggleReading: vi.fn() };
	expect(filterCommands("", withReading).map((c) => c.id)).toContain(
		"toggle-reading",
	);
});

it("filters by label, keyword or group and keeps the group order", () => {
	const c = context();
	expect(filterCommands("trash", c).map((x) => x.id)).toEqual(["open-trash"]);
	expect(filterCommands("outline", c).map((x) => x.id)).toEqual([
		"toggle-right",
	]);
	expect(filterCommands("view", c).every((x) => x.group === "View")).toBe(true);
	expect(
		groupCommands(filterCommands("", c)).map((entry) => entry.group),
	).toEqual(["Create", "View", "Go to"]);
	expect(filterCommands("zzz", c)).toEqual([]);
});

it("runs through the context it is given", () => {
	const c = context();
	COMMANDS.find((x) => x.id === "open-health")?.run(c);
	expect(c.onNavigate).toHaveBeenCalledWith("health");
});
