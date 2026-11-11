// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppShell } from "./AppShell";
import { NoteTools } from "./NoteTools";
import { Sidebar } from "./Sidebar";

// These tests drive the notebook-navigator layout (folders plus a notes list).
beforeEach(() => {
	localStorage.setItem("vaultops:sidebar-mode", "navigator");
});

afterEach(() => {
	cleanup();
	localStorage.clear();
	vi.restoreAllMocks();
});

it("the sidebar search icon opens the find dialog and the gear opens settings", async () => {
	const openSettings = vi.fn();
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
							deleteNote() {},
							move() {},
						}}
						treeNotice={null}
						onStartNote={() => {}}
						onChooseVault={() => {}}
						onShowMaintainer={() => {}}
						onNavigate={() => {}}
						onOpenSettings={openSettings}
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
	await user.click(
		screen.getByRole("button", { name: "Find or create a note" }),
	);
	expect(
		screen.getByRole("dialog", { name: "Find or create a note" }),
	).toBeTruthy();
	await user.keyboard("{Escape}");
	await user.click(screen.getByRole("button", { name: "Settings" }));
	expect(openSettings).toHaveBeenCalledOnce();
});
