// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { TabBar } from "./TabBar";
import { NEW_TAB } from "./tabs";

afterEach(cleanup);

const tabs = [
	{ path: "a.vnote", title: "Alpha", active: false },
	{ path: "Class/b.vnote", title: "Beta", active: true },
];

function setup() {
	const handlers = { onSelect: vi.fn(), onClose: vi.fn(), onNew: vi.fn() };
	render(<TabBar tabs={tabs} {...handlers} />);
	return handlers;
}

it("shows one tab per note and marks the active one", () => {
	setup();
	const list = screen.getByRole("tablist", { name: "Open notes" });
	const found = screen.getAllByRole("tab");
	expect(found.map((tab) => tab.textContent)).toEqual(["Alpha", "Beta"]);
	expect(found.map((tab) => tab.getAttribute("aria-selected"))).toEqual([
		"false",
		"true",
	]);
	expect(list.contains(found[0] as HTMLElement)).toBe(true);
	expect(found[1]?.getAttribute("title")).toBe("Class/b.vnote");
});

it("selects, closes and starts a new tab", async () => {
	const { onSelect, onClose, onNew } = setup();
	const user = userEvent.setup();
	await user.click(screen.getByRole("tab", { name: "Alpha" }));
	expect(onSelect).toHaveBeenCalledWith("a.vnote");
	await user.click(screen.getByRole("button", { name: "Close Beta" }));
	expect(onClose).toHaveBeenCalledWith("Class/b.vnote");
	await user.click(screen.getByRole("button", { name: "New tab" }));
	expect(onNew).toHaveBeenCalledTimes(1);
});

it("closes a tab with a middle click and ignores other mouse buttons", () => {
	const { onClose } = setup();
	const tab = (screen.getByRole("tab", { name: "Alpha" }) as HTMLElement)
		.parentElement as HTMLElement;
	fireEvent(tab, new MouseEvent("auxclick", { bubbles: true, button: 2 }));
	expect(onClose).not.toHaveBeenCalled();
	fireEvent(tab, new MouseEvent("auxclick", { bubbles: true, button: 1 }));
	expect(onClose).toHaveBeenCalledWith("a.vnote");
});

it("keeps every close button reachable by keyboard", () => {
	setup();
	for (const name of ["Close Alpha", "Close Beta"]) {
		const close = screen.getByRole("button", { name }) as HTMLButtonElement;
		expect(close.tabIndex).toBe(0);
		expect(close.disabled).toBe(false);
	}
});

it("shows the empty tab without a path tooltip", () => {
	render(
		<TabBar
			tabs={[{ path: NEW_TAB, title: "New tab", active: true }]}
			onSelect={() => {}}
			onClose={() => {}}
			onNew={() => {}}
		/>,
	);
	const tab = screen.getByRole("tab", { name: "New tab" });
	expect(tab.getAttribute("title")).toBeNull();
	expect(tab.getAttribute("aria-selected")).toBe("true");
});
