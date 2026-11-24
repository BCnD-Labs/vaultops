// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import { MemoryHost } from "../host/memory-host";
import { HistorySection } from "./HistorySection";

afterEach(cleanup);

it("turns history on with a name and then says it is on", async () => {
	const user = userEvent.setup();
	const host = new MemoryHost();
	await host.writeTextAtomic("a.vnote", "x");
	render(<HistorySection host={host} />);
	const button = await screen.findByRole("button", { name: "Turn on history" });
	expect((button as HTMLButtonElement).disabled).toBe(true);
	await user.type(screen.getByRole("textbox", { name: "Your name" }), "Sam");
	await user.click(button);
	expect((await screen.findByRole("status")).textContent).toContain(
		"History is on",
	);
	expect(screen.getByRole("status").textContent).toContain(
		"everything is saved in history",
	);
	expect(host.historyAuthor).toBe("Sam");
});

it("explains a missing git, someone else's repo, and a cloud folder", async () => {
	const missing = new MemoryHost();
	missing.gitInfo = { found: false, version: null, needsDeveloperTools: true };
	render(<HistorySection host={missing} />);
	expect((await screen.findByRole("status")).textContent).toContain(
		"xcode-select --install",
	);
	cleanup();
	const other = new MemoryHost();
	other.otherRepo = true;
	render(<HistorySection host={other} />);
	expect((await screen.findByRole("status")).textContent).toContain(
		"leaves it alone",
	);
	cleanup();
	const cloud = new MemoryHost();
	cloud.syncedFolder = "iCloud Drive";
	render(<HistorySection host={cloud} />);
	expect((await screen.findByRole("note")).textContent).toContain(
		"iCloud Drive",
	);
});
