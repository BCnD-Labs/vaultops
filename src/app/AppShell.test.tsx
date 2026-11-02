import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppShell } from "./AppShell";

it("renders three regions, independent toggles, breadcrumb and placeholder tabs", () => {
	const html = renderToStaticMarkup(
		<TooltipProvider>
			<AppShell
				sidebar={<aside>Tree</aside>}
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
		"Properties",
		"Changes",
		"Nothing here yet",
		"Folder",
		"Note",
		"Toggle left sidebar",
		"Toggle right sidebar",
	])
		expect(html).toContain(text);
});
