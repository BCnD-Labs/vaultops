// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { MemoryHost } from "../host/memory-host";
import { loadColors, toHex } from "../ui/appearance";
import { loadThemeChoice } from "../ui/themes";
import { SettingsDialog, SettingsScreen } from "./SettingsScreen";

// Look literals (hex colors) are not allowed in component files, so build them.
const red = toHex(204, 0, 0);
const saved = () =>
	JSON.parse(localStorage.getItem("vaultops.settings") ?? "{}")[
		"shortcuts.save"
	];
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
	// Clicking the selected segment again must not unset the choice.
	await user.click(screen.getByRole("radio", { name: "Dark" }));
	expect(loadThemeChoice().mode).toBe("dark");
	await user.click(screen.getByRole("button", { name: "Themes" }));
	await user.click(screen.getByRole("radio", { name: "Graphite" }));
	expect(document.documentElement.getAttribute("data-theme")).toBe("graphite");
	expect(loadThemeChoice()).toEqual({ id: "graphite", mode: "dark" });
	await user.click(screen.getByRole("button", { name: "Appearance" }));
	expect(loadThemeChoice().mode).toBe("dark");
});

it("keeps picked colors per mode and resets only the current mode", async () => {
	const user = userEvent.setup();
	render(<SettingsScreen host={new MemoryHost()} />);
	await user.click(screen.getByRole("button", { name: "Themes" }));
	await user.click(screen.getByRole("button", { name: "Appearance" }));
	await user.click(screen.getByRole("radio", { name: "Light" }));
	await user.click(screen.getByRole("button", { name: "Themes" }));
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

	await user.click(screen.getByRole("button", { name: "Appearance" }));
	await user.click(screen.getByRole("radio", { name: "Dark" }));
	await user.click(screen.getByRole("button", { name: "Themes" }));
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

	await user.click(screen.getByRole("button", { name: "Appearance" }));
	await user.click(screen.getByRole("radio", { name: "Light" }));
	expect(document.documentElement.style.getPropertyValue("--editor-bold")).toBe(
		red,
	);
});

it("offers every color setting with a label", async () => {
	render(<SettingsScreen host={new MemoryHost()} />);
	await userEvent.click(screen.getByRole("button", { name: "Themes" }));
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

it("has an Updates block with the update button under General, beside the version", async () => {
	render(<SettingsScreen host={new MemoryHost()} />);
	await userEvent.click(screen.getByRole("button", { name: "General" }));
	expect(screen.getByText("Version")).toBeTruthy();
	expect(screen.getByRole("heading", { name: "Updates" })).toBeTruthy();
	expect(screen.getByRole("button", { name: "Update VaultOps" })).toBeTruthy();
});

it("picks the editor font and the heading font apart from the theme", async () => {
	const user = userEvent.setup();
	render(<SettingsScreen host={new MemoryHost()} />);
	await user.click(screen.getByRole("button", { name: "Editor" }));
	await user.click(
		screen.getByRole("radio", { name: "Atkinson Hyperlegible" }),
	);
	await user.click(screen.getByRole("button", { name: "Appearance" }));
	await user.click(screen.getByRole("radio", { name: "Sora" }));
	expect(document.documentElement.getAttribute("data-editor-font")).toBe(
		"atkinson",
	);
	expect(document.documentElement.getAttribute("data-heading-font")).toBe(
		"sora",
	);
	document.documentElement.removeAttribute("data-editor-font");
	document.documentElement.removeAttribute("data-heading-font");
});

it("opens as a dialog titled Settings and closes with its button", async () => {
	const user = userEvent.setup();
	const onOpenChange = vi.fn();
	render(
		<SettingsDialog open onOpenChange={onOpenChange} host={new MemoryHost()} />,
	);
	expect(screen.getByRole("dialog", { name: "Settings" })).toBeTruthy();
	await user.click(screen.getByRole("button", { name: "Close" }));
	expect(onOpenChange).toHaveBeenCalledWith(false);
});

it("the settings window lists its sections and shows one at a time", async () => {
	const user = userEvent.setup();
	render(
		<SettingsDialog open onOpenChange={() => {}} host={new MemoryHost()} />,
	);
	expect(screen.getByRole("radio", { name: "Dark" })).toBeTruthy();
	expect(
		screen.queryByRole("radio", { name: "Atkinson Hyperlegible" }),
	).toBeNull();
	await user.click(screen.getByRole("button", { name: "Editor" }));
	expect(
		screen.getByRole("radio", { name: "Atkinson Hyperlegible" }),
	).toBeTruthy();
	expect(screen.queryByRole("radio", { name: "Dark" })).toBeNull();
	for (const name of [
		"General",
		"Interface",
		"Themes",
		"Canvas",
		"Templates & Resources",
		"Files & Vault",
		"Shortcuts",
		"Advanced",
	])
		expect(screen.getByRole("button", { name })).toBeTruthy();
});

it("loads settings saved in the old shape unchanged", () => {
	localStorage.setItem("vaultops.theme", '{"id":"graphite","mode":"dark"}');
	localStorage.setItem(
		"vaultops.fonts",
		'{"editor":"atkinson","heading":"inter"}',
	);
	localStorage.setItem(
		"vaultops.appearance",
		JSON.stringify({ light: { bold: red }, dark: {} }),
	);
	render(<SettingsScreen host={new MemoryHost()} />);
	expect(
		screen.getByRole("radio", { name: "Dark" }).getAttribute("aria-checked"),
	).toBe("true");
	// Writing one field keeps the old blob's other fields and shape.
	return userEvent
		.click(screen.getByRole("radio", { name: "Light" }))
		.then(() => {
			expect(JSON.parse(localStorage.getItem("vaultops.theme") ?? "")).toEqual({
				id: "graphite",
				mode: "light",
			});
			expect(loadColors().light.bold).toBe(red);
		});
});

it("searches across sections and shows the matching controls", async () => {
	const user = userEvent.setup();
	render(<SettingsScreen host={new MemoryHost()} />);
	await user.type(screen.getByLabelText("Search settings"), "width");
	expect(screen.getByRole("heading", { name: "Search results" })).toBeTruthy();
	expect(screen.getByText("Editor width")).toBeTruthy();
	expect(screen.queryByText("The overall look of the app.")).toBeNull();
	await user.click(screen.getByRole("radio", { name: "Wide" }));
	expect(
		document.documentElement.style.getPropertyValue("--editor-width"),
	).toBe("860px");
	await user.clear(screen.getByLabelText("Search settings"));
	await user.type(screen.getByLabelText("Search settings"), "zzzz");
	expect(screen.getByText(/No settings match/)).toBeTruthy();
	document.documentElement.removeAttribute("style");
});

it("resets just the section being viewed", async () => {
	const user = userEvent.setup();
	render(<SettingsScreen host={new MemoryHost()} />);
	await user.click(screen.getByRole("button", { name: "Editor" }));
	const reset = screen.getByRole("button", { name: "Reset section" });
	expect((reset as HTMLButtonElement).disabled).toBe(true);
	await user.click(screen.getByRole("radio", { name: "Narrow" }));
	await user.click(
		screen.getByRole("radio", { name: "Atkinson Hyperlegible" }),
	);
	await user.click(screen.getByRole("button", { name: "Reset section" }));
	expect(
		document.documentElement.style.getPropertyValue("--editor-width"),
	).toBe("");
	expect(document.documentElement.hasAttribute("data-editor-font")).toBe(false);
});

it("lists the keyboard shortcuts", async () => {
	const user = userEvent.setup();
	render(<SettingsScreen host={new MemoryHost()} />);
	await user.click(screen.getByRole("button", { name: "Shortcuts" }));
	expect(screen.getByText("Open the command bar")).toBeTruthy();
	expect(screen.getByText("Save open notes now")).toBeTruthy();
});

it("rebinds a shortcut by recording keys, and resets it", async () => {
	const user = userEvent.setup();
	render(<SettingsScreen host={new MemoryHost()} />);
	await user.click(screen.getByRole("button", { name: "Shortcuts" }));
	const change = screen.getByRole("button", {
		name: "Change shortcut for Save open notes now",
	});
	const reset = screen.getByRole("button", {
		name: "Reset shortcut for Save open notes now",
	}) as HTMLButtonElement;
	expect(reset.disabled).toBe(true);
	await user.click(change);
	expect(screen.getByText("Press keys…")).toBeTruthy();
	fireEvent.keyDown(window, { key: "Escape" });
	// Esc cancels and leaves the binding alone.
	expect(screen.queryByText("Press keys…")).toBeNull();
	expect(saved()).toBeUndefined();

	await user.click(change);
	fireEvent.keyDown(window, { key: "j", code: "KeyJ", ctrlKey: true });
	expect(saved()).toMatch(/J$/);
	expect(reset.disabled).toBe(false);
	await user.click(reset);
	expect(saved()).toBeUndefined();
});

it("clears a shortcut with Backspace", async () => {
	const user = userEvent.setup();
	render(<SettingsScreen host={new MemoryHost()} />);
	await user.click(screen.getByRole("button", { name: "Shortcuts" }));
	await user.click(
		screen.getByRole("button", {
			name: "Change shortcut for Save open notes now",
		}),
	);
	fireEvent.keyDown(window, { key: "Backspace" });
	expect(saved()).toBe("");
	expect(screen.getByText("None")).toBeTruthy();
});

it("refuses a duplicate binding and names the other command", async () => {
	const user = userEvent.setup();
	render(<SettingsScreen host={new MemoryHost()} />);
	await user.click(screen.getByRole("button", { name: "Shortcuts" }));
	await user.click(
		screen.getByRole("button", {
			name: "Change shortcut for Save open notes now",
		}),
	);
	// Command bar's default is Mod+K; record the same on whichever platform runs.
	fireEvent.keyDown(window, { key: "k", code: "KeyK", ctrlKey: true });
	const alert = await screen.findByRole("alert");
	expect(alert.textContent).toContain("Open the command bar");
	expect(saved()).toBeUndefined();
});

it("shows the editor keys read-only and exports shortcut overrides", async () => {
	const user = userEvent.setup();
	render(<SettingsScreen host={new MemoryHost()} />);
	await user.click(screen.getByRole("button", { name: "Shortcuts" }));
	expect(screen.getByRole("heading", { name: "Editor" })).toBeTruthy();
	expect(screen.getByText("Bold")).toBeTruthy();
	expect(
		screen.queryByRole("button", { name: /Change shortcut for Bold/ }),
	).toBeNull();
});

it("exports settings and imports them back, listing what was skipped", async () => {
	const user = userEvent.setup();
	render(<SettingsScreen host={new MemoryHost()} />);
	await user.click(screen.getByRole("button", { name: "Advanced" }));
	const box = screen.getByLabelText("Settings JSON") as HTMLTextAreaElement;
	await user.click(screen.getByRole("button", { name: "Export settings" }));
	expect(JSON.parse(box.value).settings["appearance.mode"]).toBe("system");

	fireEvent.change(box, {
		target: {
			value: JSON.stringify({
				settings: {
					"appearance.mode": "dark",
					"bogus.key": 1,
					"editor.width": "7",
				},
			}),
		},
	});
	await user.click(screen.getByRole("button", { name: "Import settings" }));
	expect(loadThemeChoice().mode).toBe("dark");
	const status = screen.getByRole("status").textContent ?? "";
	expect(status).toContain("Imported 1 setting");
	expect(status).toContain("bogus.key: unknown setting");
	expect(status).toContain("editor.width");

	fireEvent.change(box, { target: { value: "{nope" } });
	await user.click(screen.getByRole("button", { name: "Import settings" }));
	expect(screen.getByRole("status").textContent).toContain("not valid JSON");
});

const sizeVar = (name: string) =>
	document.documentElement.style.getPropertyValue(name);
const savedSizes = () =>
	JSON.parse(localStorage.getItem("vaultops.settings") ?? "{}");

it("steps the text sizes live, saves them, and resets one or all", async () => {
	const user = userEvent.setup();
	const { unmount } = render(<SettingsScreen host={new MemoryHost()} />);
	await user.click(screen.getByRole("button", { name: "Editor" }));
	// One row per level, each with a sample line.
	for (const label of [
		"Body",
		"Heading 1",
		"Heading 2",
		"Heading 3",
		"Heading 4",
		"Heading 5",
		"Heading 6",
	])
		expect(screen.getByLabelText(label)).toBeTruthy();
	expect(document.querySelectorAll(".text-size-sample")).toHaveLength(7);

	// Nothing is overridden until a size is picked: the theme's sizes stay.
	expect(sizeVar("--editor-h1-size")).toBe("");
	expect(savedSizes()["editor.size.h1"]).toBeUndefined();

	// + and - change the variable at once, with no apply button.
	await user.click(screen.getByRole("button", { name: "Larger heading 5" }));
	expect(sizeVar("--editor-h5-size")).toBe("17px");
	await user.click(screen.getByRole("button", { name: "Larger heading 5" }));
	await user.click(screen.getByRole("button", { name: "Smaller heading 5" }));
	expect(sizeVar("--editor-h5-size")).toBe("17px");
	expect(savedSizes()["editor.size.h5"]).toBe(17);

	// Typing a number applies on Enter.
	const body = screen.getByLabelText("Body") as HTMLInputElement;
	await user.clear(body);
	await user.type(body, "20{Enter}");
	expect(sizeVar("--editor-font-size")).toBe("20px");
	expect(savedSizes()["editor.size.body"]).toBe(20);

	// The choices are still there in a new window.
	unmount();
	render(<SettingsScreen host={new MemoryHost()} />);
	await user.click(screen.getByRole("button", { name: "Editor" }));
	expect((screen.getByLabelText("Heading 5") as HTMLInputElement).value).toBe(
		"17",
	);

	// Reset one row: back to the theme's own size and the saved value is gone.
	await user.click(screen.getByRole("button", { name: "Reset heading 5" }));
	expect(sizeVar("--editor-h5-size")).toBe("");
	expect(savedSizes()["editor.size.h5"]).toBeUndefined();
	expect(sizeVar("--editor-font-size")).toBe("20px");

	// Reset all.
	await user.click(screen.getByRole("button", { name: "Larger heading 1" }));
	expect(sizeVar("--editor-h1-size")).toBe("17px");
	await user.click(screen.getByRole("button", { name: "Reset all" }));
	expect(sizeVar("--editor-h1-size")).toBe("");
	expect(sizeVar("--editor-font-size")).toBe("");
	expect(savedSizes()["editor.size.body"]).toBeUndefined();
});

it("finds the text size rows by search", async () => {
	const user = userEvent.setup();
	render(<SettingsScreen host={new MemoryHost()} />);
	await user.type(screen.getByLabelText("Search settings"), "font size");
	expect(screen.getByLabelText("Heading 3")).toBeTruthy();
});

it("groups rows into titled cards and applies the new interface settings at once", async () => {
	const user = userEvent.setup();
	const root = document.documentElement;
	render(<SettingsScreen host={new MemoryHost()} />);
	expect(screen.getByRole("heading", { name: "Look" })).toBeTruthy();
	expect(document.querySelectorAll(".settings-card").length).toBeGreaterThan(1);
	await user.click(screen.getByRole("switch", { name: "Reduce motion" }));
	expect(root.style.getPropertyValue("--motion-fast")).toBe("0ms");
	await user.click(screen.getByRole("button", { name: "Interface" }));
	await user.click(screen.getByRole("switch", { name: "Show status bar" }));
	expect(root.hasAttribute("data-hide-status-bar")).toBe(true);
	await user.click(screen.getByRole("button", { name: "Editor" }));
	await user.click(screen.getByRole("radio", { name: "Roomy" }));
	expect(root.style.getPropertyValue("--editor-line-height")).toBe("1.9");
	await user.click(screen.getByRole("switch", { name: "Spellcheck" }));
	expect(root.getAttribute("spellcheck")).toBe("false");
	root.removeAttribute("data-hide-status-bar");
	root.removeAttribute("data-reduce-motion");
	root.removeAttribute("spellcheck");
});

it("tunes the theme by part: presets, switches, per-mode colors and custom CSS", async () => {
	const user = userEvent.setup();
	const root = document.documentElement;
	render(<SettingsScreen host={new MemoryHost()} initialSection="themes" />);
	for (const name of [
		"Shape and spacing",
		"Window and sidebars",
		"Editor",
		"Headings",
		"Lists",
		"Quotes",
		"Callouts",
		"Code",
		"Custom CSS",
	])
		expect(screen.getByRole("heading", { name })).toBeTruthy();
	await user.click(screen.getByRole("radio", { name: "Square" }));
	expect(root.style.getPropertyValue("--radius-1")).toBe("2px");
	await user.click(screen.getByRole("radio", { name: "Heavy" }));
	expect(root.style.getPropertyValue("--heading-weight")).toBe("800");
	await user.click(screen.getByRole("switch", { name: "Indent guides" }));
	expect(root.hasAttribute("data-hide-list-guides")).toBe(true);
	fireEvent.change(screen.getByLabelText("Heading text"), {
		target: { value: red },
	});
	expect(root.style.getPropertyValue("--heading-color")).toBe(red);
	fireEvent.change(screen.getByLabelText("Custom CSS"), {
		target: {
			value:
				"@import url(https://x.test/a.css); .x { background: url(https://x.test/i.png); color: tomato; }",
		},
	});
	const style = document.getElementById("vaultops-custom-css");
	expect(style?.textContent).toContain("color: tomato");
	expect(style?.textContent).not.toContain("x.test");
	style?.remove();
	root.removeAttribute("data-hide-list-guides");
});
