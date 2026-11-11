import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { buildTree } from "../core/notes/tree";
import { Sidebar } from "./Sidebar";
import type { VaultView } from "./session";

const view: VaultView = {
	name: "Test vault",
	status: "opened",
	writable: true,
	messages: [],
	report: [],
	folders: ["Class", "Empty"],
	notes: [
		{
			path: "Root.vnote",
			title: "Root note",
			preview: "",
			tags: [],
			readOnly: false,
		},
		{
			path: "Class/A.vnote",
			title: "Class note",
			preview: "",
			tags: ["Work"],
			readOnly: true,
		},
	],
};
afterEach(() => vi.unstubAllGlobals());
it.each(["horizontal", "vertical"])(
	"renders folder navigation and the selected notes in %s layout",
	(orientation) => {
		vi.stubGlobal("localStorage", {
			getItem: (key: string) =>
				key === "vaultops:sidebar-mode"
					? "navigator"
					: JSON.stringify({
							orientation,
							sizes: { navigation: 40, notes: 60 },
						}),
		});
		const out = renderToStaticMarkup(
			<TooltipProvider>
				<Sidebar
					view={view}
					busy={false}
					maintainer={false}
					selection={{ kind: "folder", value: "Class" }}
					livePath="Class/A.vnote"
					tree={buildTree(view.folders, view.notes)}
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
					onSelection={() => {}}
					onOpen={() => {}}
				/>
			</TooltipProvider>,
		);
		expect(out).toContain(
			`aria-orientation="${orientation === "horizontal" ? "vertical" : "horizontal"}"`,
		);
		const [navigation, list] = out.split('aria-label="Notes list"');
		expect(navigation).toContain("Empty");
		expect(navigation).not.toContain("#Work");
		expect(navigation).not.toContain("Class note");
		expect(list).toContain("Class note");
		expect(list).not.toContain("Root note");
		expect(list).toContain('aria-current="true"');
		expect(list).toContain("read-only");
		expect(out).toContain('aria-label="New folder"');
		expect(out).toContain('aria-label="New note"');
	},
);

const actions = {
	createFolder() {},
	renameFolder() {},
	deleteFolder() {},
	deleteNote() {},
	move() {},
};

it("has search in the top row and the vault menu with settings in the bottom row, with no other footer rows", () => {
	const out = renderToStaticMarkup(
		<TooltipProvider>
			<Sidebar
				view={view}
				busy={false}
				maintainer={false}
				selection={{ kind: "all" }}
				livePath={null}
				tree={buildTree(view.folders, view.notes)}
				treeActions={actions}
				treeNotice={null}
				onStartNote={() => {}}
				onChooseVault={() => {}}
				onShowMaintainer={() => {}}
				onNavigate={() => {}}
				onOpenTemplates={() => {}}
				onOpenResources={() => {}}
				onSelection={() => {}}
				onOpen={() => {}}
			/>
		</TooltipProvider>,
	);
	const [top, rest] = out.split('class="section-label"');
	expect(top).toContain('aria-label="Find or create a note"');
	expect(top).toContain('aria-label="New folder"');
	expect(top).not.toContain("Vault menu");
	const foot = (rest ?? "").slice((rest ?? "").indexOf('class="sidebar-foot"'));
	expect(foot).toContain('aria-label="Vault menu: Test vault"');
	expect(foot).toContain('aria-label="Settings"');
	// Managers, trash and health no longer sit as rows in the sidebar.
	for (const gone of [">Resources<", ">Templates<", ">Trash<", ">Health<"])
		expect(out).not.toContain(gone);
});
