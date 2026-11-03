// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppShell } from "./AppShell";
import { NoteTools } from "./NoteTools";
import { Sidebar } from "./Sidebar";

afterEach(() => {
	cleanup();
	localStorage.clear();
	vi.restoreAllMocks();
});

it("rail expands Tags on every click and opens the Changes tab", async () => {
	const scroll = vi.fn();
	vi.spyOn(HTMLElement.prototype, "scrollIntoView").mockImplementation(scroll);
	const user = userEvent.setup();
	render(
		<TooltipProvider>
			<AppShell
				vault="Vault"
				path={null}
				title={null}
				sidebar={
					<Sidebar
						view={null}
						busy={false}
						maintainer={false}
						selection={{ kind: "all" }}
						livePath={null}
						tree={[]}
						treeActions={{
							createFolder() {},
							renameFolder() {},
							deleteFolder() {},
							move() {},
						}}
						treeNotice={null}
						onStartNote={() => {}}
						onChooseVault={() => {}}
						onShowMaintainer={() => {}}
						onNavigate={() => {}}
						onSelection={() => {}}
						onOpen={() => {}}
					/>
				}
				tools={
					<NoteTools
						hasNote={false}
						props={null}
						editable={false}
						onChange={() => {}}
						onOpenTag={() => {}}
					/>
				}
			>
				<main>Editor</main>
			</AppShell>
		</TooltipProvider>,
	);
	const tags = screen.getByText("Tags", { selector: "summary" })
		.parentElement as HTMLDetailsElement;
	for (let i = 0; i < 2; i++) {
		tags.open = false;
		await user.click(screen.getByRole("button", { name: "Tags" }));
		expect(tags.open).toBe(true);
	}
	expect(scroll).toHaveBeenCalledTimes(2);
	await user.click(screen.getByRole("button", { name: "Changes" }));
	expect(
		screen.getByRole("tab", { name: "Changes" }).getAttribute("aria-selected"),
	).toBe("true");
	expect(
		screen.getByText("Commit, history and sync arrive soon."),
	).toBeTruthy();
	await user.click(screen.getByRole("tab", { name: "Properties" }));
	await user.click(screen.getByRole("button", { name: "Changes" }));
	expect(
		screen.getByRole("tab", { name: "Changes" }).getAttribute("aria-selected"),
	).toBe("true");
	await user.click(screen.getByRole("button", { name: "Search" }));
	expect(
		screen.getByRole("dialog", { name: "Find or create a note" }),
	).toBeTruthy();
	await user.keyboard("{Escape}");
	for (const [label, reason] of [["Settings", "Arrives with Settings"]]) {
		const button = screen.getByRole("button", { name: label });
		expect(button.getAttribute("aria-disabled")).toBe("true");
		expect(button.title).toBe(reason);
	}
});
