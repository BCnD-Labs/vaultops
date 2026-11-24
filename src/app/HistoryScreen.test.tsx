// @vitest-environment happy-dom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { MemoryHost } from "../host/memory-host";
import { HISTORY_PAGE, HistoryScreen } from "./HistoryScreen";

afterEach(() => {
	cleanup();
	localStorage.clear();
});

it("says history is off and offers Settings", async () => {
	const user = userEvent.setup();
	const onOpenSettings = vi.fn();
	render(
		<HistoryScreen host={new MemoryHost()} onOpenSettings={onOpenSettings} />,
	);
	await user.click(
		await screen.findByRole("button", { name: "Turn it on in Settings" }),
	);
	expect(onOpenSettings).toHaveBeenCalled();
});

it("lists unsaved changes on top, then save points newest first with their details", async () => {
	const host = new MemoryHost();
	await host.writeTextAtomic("a.vnote", "1");
	await host.vcs.enable("Sam");
	await host.writeTextAtomic("a.vnote", "2");
	await host.vcs.savePoint("Edited a\n\nWith more words");
	await host.writeTextAtomic("b.vnote", "new");
	render(<HistoryScreen host={host} />);
	const list = await screen.findByRole("list");
	await within(list).findByText("Edited a");
	const rows = within(list).getAllByRole("listitem");
	expect(rows[0]?.textContent).toContain("Unsaved changes (1 file)");
	expect(rows[1]?.textContent).toContain("Edited a");
	expect(rows[1]?.textContent).toContain("Sam");
	expect(rows[1]?.textContent).toContain("1 file");
	expect(rows[1]?.textContent).toContain("With more words");
	expect(rows[2]?.textContent).toContain("History turned on");
});

it("loads older save points a page at a time", async () => {
	const user = userEvent.setup();
	const host = new MemoryHost();
	await host.vcs.enable("Sam");
	for (let n = 0; n < HISTORY_PAGE + 2; n++) {
		await host.writeTextAtomic("a.vnote", String(n));
		await host.vcs.savePoint(`Save ${n}`);
	}
	render(<HistoryScreen host={host} />);
	await screen.findByText(`Save ${HISTORY_PAGE + 1}`);
	expect(screen.queryByText("History turned on")).toBeNull();
	await user.click(
		screen.getByRole("button", { name: "Load older save points" }),
	);
	expect(await screen.findByText("History turned on")).toBeTruthy();
	expect(
		screen.queryByRole("button", { name: "Load older save points" }),
	).toBeNull();
});

it("switches to the graph, shows branch names on their tips, and remembers the choice", async () => {
	const user = userEvent.setup();
	const host = new MemoryHost();
	await host.writeTextAtomic("a.vnote", "1");
	await host.vcs.enable("Sam");
	await host.writeTextAtomic("a.vnote", "2");
	await host.vcs.savePoint("Edited a");
	render(<HistoryScreen host={host} />);
	await screen.findByText("Edited a");
	await user.click(screen.getByRole("radio", { name: "Graph" }));
	const graph = await screen.findByRole("list", { name: "History graph" });
	const rows = within(graph).getAllByRole("listitem");
	expect(rows).toHaveLength(2);
	expect(rows[0]?.textContent).toContain("main");
	expect(rows[0]?.getAttribute("aria-current")).toBe("true");
	expect(rows[0]?.querySelector("circle")).toBeTruthy();
	expect(localStorage.getItem("vaultops:history-view")).toBe("graph");
	cleanup();
	render(<HistoryScreen host={host} />);
	expect(
		await screen.findByRole("list", { name: "History graph" }),
	).toBeTruthy();
});
