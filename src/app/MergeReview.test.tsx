// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { MemoryHost } from "../host/memory-host";
import { MergeReview } from "./MergeReview";

afterEach(cleanup);

const note = (text: string) =>
	`${JSON.stringify({ format: "vaultops-note", v: 1, noteId: "n", title: "N" })}\n${JSON.stringify({ id: "a", type: "paragraph", parent: null, content: [{ type: "text", text }] })}\n`;

async function diverged() {
	const host = new MemoryHost();
	await host.writeTextAtomic("N.vnote", note("Draft"));
	await host.vcs.enable("Sam");
	await host.vcs.createBranch("try-out", true);
	await host.writeTextAtomic("N.vnote", note("Their draft"));
	await host.writeTextAtomic("New.vnote", note("New"));
	await host.vcs.savePoint("try-out work");
	await host.vcs.switchBranch("main");
	await host.writeTextAtomic("N.vnote", note("My draft"));
	await host.vcs.savePoint("main work");
	return host;
}

it("shows what merged and finishes with a save point", async () => {
	const user = userEvent.setup();
	const host = await diverged();
	const onDone = vi.fn();
	render(
		<MergeReview host={host} branch="try-out" current="main" onDone={onDone} />,
	);
	const summary = await screen.findByRole("status");
	expect(summary.textContent).toContain("2 files change");
	expect(summary.textContent).toContain("1 spot changed in two places");
	expect(screen.getByText("N.vnote").parentElement?.textContent).toContain(
		"combined",
	);
	await user.click(screen.getByRole("button", { name: "Finish merge" }));
	expect(onDone).toHaveBeenCalledWith(true);
	expect(host.historyLog.at(-1)).toBe("Merged try-out into main");
	expect(await host.readText("New.vnote")).toContain("New");
});

it("cancels and puts everything back", async () => {
	const user = userEvent.setup();
	const host = await diverged();
	const onDone = vi.fn();
	render(
		<MergeReview host={host} branch="try-out" current="main" onDone={onDone} />,
	);
	await user.click(await screen.findByRole("button", { name: "Cancel merge" }));
	expect(onDone).toHaveBeenCalledWith(true);
	expect(await host.readText("N.vnote")).toContain("My draft");
	await expect(host.readText("New.vnote")).rejects.toThrow();
	expect((await host.vcs.status()).merging).toBe(false);
});

it("says when there's nothing to merge, and doesn't start if a note couldn't be saved", async () => {
	const host = await diverged();
	const onDone = vi.fn();
	render(
		<MergeReview
			host={host}
			branch="try-out"
			current="main"
			beforeStart={async () => false}
			onDone={onDone}
		/>,
	);
	expect((await screen.findByRole("alert")).textContent).toContain(
		"didn't start",
	);
	expect((await host.vcs.status()).merging).toBe(false);
	cleanup();
	await host.vcs.createBranch("same", false);
	render(
		<MergeReview host={host} branch="same" current="main" onDone={onDone} />,
	);
	expect((await screen.findByRole("status")).textContent).toContain(
		"Nothing to merge",
	);
});
