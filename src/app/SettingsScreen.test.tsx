// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import { MemoryHost } from "../host/memory-host";
import { loadColors, toHex } from "../ui/appearance";
import { loadThemeChoice } from "../ui/themes";
import { SettingsScreen } from "./SettingsScreen";

// Look literals (hex colors) are not allowed in component files, so build them.
const red = toHex(204, 0, 0);
const navy = toHex(0, 17, 34);

afterEach(() => {
	cleanup();
	localStorage.clear();
	document.documentElement.removeAttribute("style");
	document.documentElement.removeAttribute("data-mode");
	document.documentElement.removeAttribute("data-theme");
});

it("switches mode and theme, applies them at once and remembers them", async () => {
	const user = userEvent.setup();
	render(<SettingsScreen host={new MemoryHost()} />);
	await user.click(screen.getByRole("radio", { name: "Dark" }));
	expect(document.documentElement.getAttribute("data-mode")).toBe("dark");
	expect(loadThemeChoice().mode).toBe("dark");
	await user.click(screen.getByRole("radio", { name: "Graphite" }));
	expect(document.documentElement.getAttribute("data-theme")).toBe("graphite");
	expect(loadThemeChoice()).toEqual({ id: "graphite", mode: "dark" });
	// Clicking the selected segment again must not unset the choice.
	await user.click(screen.getByRole("radio", { name: "Dark" }));
	expect(loadThemeChoice().mode).toBe("dark");
});

it("keeps picked colors per mode and resets only the current mode", async () => {
	const user = userEvent.setup();
	render(<SettingsScreen host={new MemoryHost()} />);
	await user.click(screen.getByRole("radio", { name: "Light" }));
	const reset = () =>
		screen.getByRole("button", { name: /^Reset (light|dark) colors$/ });
	expect((reset() as HTMLButtonElement).disabled).toBe(true);

	fireEvent.change(screen.getByLabelText("Bold text"), {
		target: { value: red },
	});
	expect(loadColors().light.bold).toBe(red);
	expect(document.documentElement.style.getPropertyValue("--editor-bold")).toBe(
		red,
	);

	await user.click(screen.getByRole("radio", { name: "Dark" }));
	expect(document.documentElement.style.getPropertyValue("--editor-bold")).toBe(
		"",
	);
	fireEvent.change(screen.getByLabelText("Editor background"), {
		target: { value: navy },
	});
	expect(loadColors().dark.editorBackground).toBe(navy);

	await user.click(reset());
	expect(loadColors().dark).toEqual({});
	expect(loadColors().light.bold).toBe(red);

	await user.click(screen.getByRole("radio", { name: "Light" }));
	expect(document.documentElement.style.getPropertyValue("--editor-bold")).toBe(
		red,
	);
});

it("offers every color setting with a label", () => {
	render(<SettingsScreen host={new MemoryHost()} />);
	for (const label of [
		"Background (frame and side panels)",
		"Editor background",
		"Editor text",
		"Bold text",
		"Italic text",
		"Quote block text",
		"Code block background",
		"Code text",
	])
		expect(screen.getByLabelText(label)).toBeTruthy();
});

it("has an Updates section with the update button", () => {
	render(<SettingsScreen host={new MemoryHost()} />);
	expect(screen.getByRole("heading", { name: "Updates" })).toBeTruthy();
	expect(screen.getByRole("button", { name: "Update VaultOps" })).toBeTruthy();
});
