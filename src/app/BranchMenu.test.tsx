// @vitest-environment happy-dom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { MemoryHost } from "../host/memory-host";
import { BranchMenu } from "./BranchMenu";

afterEach(cleanup);

async function vault() {
	const host = new MemoryHost();
	await host.writeTextAtomic("a.vnote", "main text");
	await host.vcs.enable("Sam");
	return host;
}

function setup(host: MemoryHost, beforeSwitch = async () => true) {
	const onChanged = vi.fn();
	const view = render(
		<BranchMenu
			host={host}
			current="main"
			beforeSwitch={beforeSwitch}
			onChanged={onChanged}
		/>,
	);
	return { onChanged, view };
}

it("creates a branch and switches back, with each branch's own files", async () => {
	const user = userEvent.setup();
	const host = await vault();
	const { onChanged } = setup(host);
	await user.click(screen.getByRole("button", { name: /main/ }));
	await user.type(
		await screen.findByRole("textbox", { name: "New branch name" }),
		"try-out",
	);
	await user.click(screen.getByRole("button", { name: "Create and switch" }));
	expect(onChanged).toHaveBeenLastCalledWith(true);
	expect((await host.vcs.status()).branch).toBe("try-out");
	await host.writeTextAtomic("a.vnote", "try-out text");
	await host.vcs.savePoint("On try-out");
	const menu = within(await screen.findByRole("dialog"));
	await user.click(await menu.findByRole("button", { name: /^main/ }));
	expect(await host.readText("a.vnote")).toBe("main text");
	expect((await host.vcs.status()).branch).toBe("main");
});

it("refuses to switch with unsaved changes or when a note couldn't be saved", async () => {
	const user = userEvent.setup();
	const host = await vault();
	await host.vcs.createBranch("other", false);
	await host.writeTextAtomic("a.vnote", "unsaved");
	setup(host);
	await user.click(screen.getByRole("button", { name: /main/ }));
	await user.click(await screen.findByRole("button", { name: /^other/ }));
	expect((await screen.findByRole("alert")).textContent).toContain(
		"make a save point first",
	);
	expect(await host.readText("a.vnote")).toBe("unsaved");
	cleanup();
	await host.vcs.savePoint("saved");
	setup(host, async () => false);
	await user.click(screen.getByRole("button", { name: /main/ }));
	await user.click(await screen.findByRole("button", { name: /^other/ }));
	expect((await screen.findByRole("alert")).textContent).toContain(
		"couldn't be saved",
	);
	expect((await host.vcs.status()).branch).toBe("main");
});

it("keeps a branch with unmerged work, deletes a merged one, and renames the current one", async () => {
	const user = userEvent.setup();
	const host = await vault();
	await host.vcs.createBranch("empty", false);
	await host.vcs.createBranch("work", true);
	await host.writeTextAtomic("a.vnote", "work");
	await host.vcs.savePoint("Work");
	await host.vcs.switchBranch("main");
	setup(host);
	await user.click(screen.getByRole("button", { name: /main/ }));
	await user.click(
		await screen.findByRole("button", { name: "Delete branch work" }),
	);
	expect((await screen.findByRole("alert")).textContent).toContain(
		"so it was kept",
	);
	await user.click(screen.getByRole("button", { name: "Delete branch empty" }));
	expect(
		screen.queryByRole("button", { name: "Delete branch empty" }),
	).toBeNull();
	await user.type(
		screen.getByRole("textbox", { name: "Rename current branch" }),
		"trunk",
	);
	await user.click(screen.getByRole("button", { name: "Rename" }));
	expect((await host.vcs.branches()).map((b) => b.name)).toEqual([
		"trunk",
		"work",
	]);
});
