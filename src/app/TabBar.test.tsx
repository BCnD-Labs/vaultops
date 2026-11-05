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

// happy-dom has no real DataTransfer, so a drag carries this stand-in.
function transfer() {
	const data = new Map<string, string>();
	return {
		data,
		get types() {
			return Array.from(data.keys());
		},
		setData: (type: string, value: string) => void data.set(type, value),
		getData: (type: string) => data.get(type) ?? "",
		effectAllowed: "",
		dropEffect: "",
	};
}

// happy-dom's drag events drop clientX, so build the event by hand.
function drag(
	node: Element,
	type: "dragover" | "drop",
	dt: ReturnType<typeof transfer>,
	clientX: number,
) {
	const event = Object.assign(
		new Event(type, { bubbles: true, cancelable: true }),
		{
			dataTransfer: dt,
			clientX,
		},
	);
	return fireEvent(node, event);
}

const three = [
	{ path: "a.vnote", title: "Alpha", active: false },
	{ path: "b.vnote", title: "Beta", active: true },
	{ path: "c.vnote", title: "Gamma", active: false },
];

function strip(extra: Record<string, unknown> = {}) {
	const props = {
		onDropTab: vi.fn(),
		onTabDragStart: vi.fn(),
		onTabDragEnd: vi.fn(),
		onNudge: vi.fn(),
	};
	render(
		<TabBar
			tabs={three}
			paneId="left"
			onSelect={() => {}}
			onClose={() => {}}
			onNew={() => {}}
			{...props}
			{...extra}
		/>,
	);
	// Tabs sit 100px wide side by side: middles at 50, 150, 250.
	for (const [i, node] of document.querySelectorAll(".tab").entries())
		node.getBoundingClientRect = () =>
			({ left: i * 100, width: 100 }) as DOMRect;
	const tabEl = (name: string) =>
		(screen.getByRole("tab", { name }) as HTMLElement)
			.parentElement as HTMLElement;
	return { ...props, tabEl, list: screen.getByRole("tablist") };
}

it("tabs are draggable only when the strip takes drops, and never the empty tab", () => {
	render(
		<TabBar
			tabs={[
				{ path: "a.vnote", title: "Alpha", active: true },
				{ path: NEW_TAB, title: "New tab", active: false },
			]}
			paneId="left"
			onDropTab={() => {}}
			onSelect={() => {}}
			onClose={() => {}}
			onNew={() => {}}
		/>,
	);
	const el = (name: string) =>
		(screen.getByRole("tab", { name }) as HTMLElement).parentElement;
	expect(el("Alpha")?.getAttribute("draggable")).toBe("true");
	expect(el("New tab")?.getAttribute("draggable")).toBe("false");
	cleanup();
	setup();
	expect(
		(
			screen.getByRole("tab", { name: "Alpha" }) as HTMLElement
		).parentElement?.getAttribute("draggable"),
	).not.toBe("true");
});

it("starting a drag says which tab and which pane, and ending it tells the parent", () => {
	const { tabEl, onTabDragStart, onTabDragEnd } = strip();
	const dt = transfer();
	fireEvent.dragStart(tabEl("Beta"), { dataTransfer: dt });
	expect(onTabDragStart).toHaveBeenCalledWith({
		path: "b.vnote",
		from: "left",
	});
	expect(JSON.parse(dt.getData("application/x-vaultops-tab"))).toEqual({
		path: "b.vnote",
		from: "left",
	});
	fireEvent.dragEnd(tabEl("Beta"), { dataTransfer: dt });
	expect(onTabDragEnd).toHaveBeenCalledTimes(1);
});

it("a drop reports the place in the strip, by the tab middles", () => {
	const { list, onDropTab } = strip();
	const dt = transfer();
	dt.setData(
		"application/x-vaultops-tab",
		JSON.stringify({ path: "z.vnote", from: "right" }),
	);
	drag(list, "drop", dt, 120);
	expect(onDropTab).toHaveBeenLastCalledWith(
		{ path: "z.vnote", from: "right" },
		1,
	);
	drag(list, "drop", dt, 10);
	expect(onDropTab).toHaveBeenLastCalledWith(
		{ path: "z.vnote", from: "right" },
		0,
	);
	drag(list, "drop", dt, 290);
	expect(onDropTab).toHaveBeenLastCalledWith(
		{ path: "z.vnote", from: "right" },
		3,
	);
});

it("takes a drop on the blank bar after the last tab, and on the bar's padding", () => {
	const { onDropTab } = strip();
	const bar = document.querySelector(".tab-bar") as HTMLElement;
	const dt = transfer();
	dt.setData(
		"application/x-vaultops-tab",
		JSON.stringify({ path: "a.vnote", from: "left" }),
	);
	// Far right of the last tab: the bar is wider than its tabs.
	expect(drag(bar, "dragover", dt, 600)).toBe(false);
	expect(
		(document.querySelector(".tab-list") as HTMLElement).getAttribute(
			"data-drop-end",
		),
	).toBe("true");
	drag(bar, "drop", dt, 600);
	expect(onDropTab).toHaveBeenLastCalledWith(
		{ path: "a.vnote", from: "left" },
		3,
	);
	// And the left padding, before the first tab.
	drag(bar, "drop", dt, 2);
	expect(onDropTab).toHaveBeenLastCalledWith(
		{ path: "a.vnote", from: "left" },
		0,
	);
});

it("marks where a drag would land and clears the mark when it leaves", () => {
	const { list, tabEl } = strip();
	const dt = transfer();
	dt.setData(
		"application/x-vaultops-tab",
		JSON.stringify({ path: "z.vnote", from: "right" }),
	);
	drag(list, "dragover", dt, 120);
	expect(tabEl("Beta").getAttribute("data-drop")).toBe("before");
	expect(tabEl("Alpha").getAttribute("data-drop")).toBeNull();
	drag(list, "dragover", dt, 290);
	expect(list.getAttribute("data-drop-end")).toBe("true");
	expect(tabEl("Beta").getAttribute("data-drop")).toBeNull();
	fireEvent.dragLeave(list, { relatedTarget: document.body });
	expect(list.getAttribute("data-drop-end")).toBeNull();
});

it("ignores drags that are not tabs, such as a block or a file", () => {
	const { list, tabEl, onDropTab } = strip();
	const dt = transfer();
	dt.setData("application/x-vaultops-block", "{}");
	const over = drag(list, "dragover", dt, 120);
	// Not cancelled, so the browser keeps the drop forbidden here.
	expect(over).toBe(true);
	expect(tabEl("Beta").getAttribute("data-drop")).toBeNull();
	drag(list, "drop", dt, 120);
	expect(onDropTab).not.toHaveBeenCalled();
});

it("Alt+Shift+Arrow nudges a tab, and a plain arrow does not", () => {
	const { onNudge } = strip();
	const beta = screen.getByRole("tab", { name: "Beta" });
	fireEvent.keyDown(beta, { key: "ArrowLeft", altKey: true, shiftKey: true });
	expect(onNudge).toHaveBeenLastCalledWith("b.vnote", -1);
	fireEvent.keyDown(beta, { key: "ArrowRight", altKey: true, shiftKey: true });
	expect(onNudge).toHaveBeenLastCalledWith("b.vnote", 1);
	onNudge.mockClear();
	fireEvent.keyDown(beta, { key: "ArrowRight" });
	fireEvent.keyDown(beta, { key: "ArrowRight", altKey: true });
	fireEvent.keyDown(beta, { key: "ArrowUp", altKey: true, shiftKey: true });
	expect(onNudge).not.toHaveBeenCalled();
});

it("hands focus back to the tab named by focusRequest", () => {
	const { rerender } = render(
		<TabBar
			tabs={three}
			paneId="left"
			onDropTab={() => {}}
			onSelect={() => {}}
			onClose={() => {}}
			onNew={() => {}}
			focusRequest={null}
		/>,
	);
	expect(document.activeElement).toBe(document.body);
	rerender(
		<TabBar
			tabs={three}
			paneId="left"
			onDropTab={() => {}}
			onSelect={() => {}}
			onClose={() => {}}
			onNew={() => {}}
			focusRequest="c.vnote"
		/>,
	);
	expect(document.activeElement).toBe(
		screen.getByRole("tab", { name: "Gamma" }),
	);
});
