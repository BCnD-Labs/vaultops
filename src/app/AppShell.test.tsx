import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppShell } from "./AppShell";

it("renders three regions, independent toggles, breadcrumb and note tools", () => {
	const html = renderToStaticMarkup(
		<TooltipProvider>
			<AppShell
				sidebar={<aside>Tree</aside>}
				tools={<div>Note tools</div>}
				vault="Vault"
				path="Folder/Note.vnote"
				title="Note"
			>
				<main>Editor</main>
			</AppShell>
		</TooltipProvider>,
	);
	expect(html.match(/data-panel=/g)).toHaveLength(3);
	for (const text of [
		'id="left"',
		'id="editor"',
		'id="right"',
		"Tree",
		"Editor",
		"Note tools",
		"Folder",
		"Note",
		"Toggle left sidebar",
		"Toggle right sidebar",
		'aria-label="Workspace"',
		'aria-label="Notes"',
		'aria-label="Search"',
		'aria-label="Tags"',
		'aria-label="Changes"',
		'aria-label="Settings"',
		"Find or create a note...",
	])
		expect(html).toContain(text);
});
