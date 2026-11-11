// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ShellNavigation } from "./AppShell";
import { SearchButton } from "./SearchButton";

afterEach(cleanup);

it("is a search icon named Find or create a note, hints its keys on hover, and asks the shell to open the dialog", async () => {
	const openSearch = vi.fn();
	const user = userEvent.setup();
	render(
		<TooltipProvider delayDuration={0}>
			<ShellNavigation.Provider
				value={{
					tags: 0,
					changes: 0,
					planner: 0,
					newFolder: 0,
					toolsVisible: true,
					leftCollapsed: false,
					rightCollapsed: false,
					propertyRequest: null,
					openProperties: () => {},
					openSearch,
				}}
			>
				<SearchButton />
			</ShellNavigation.Provider>
		</TooltipProvider>,
	);
	const button = screen.getByRole("button", { name: "Find or create a note" });
	await user.hover(button);
	expect(
		(await screen.findAllByText(/Find or create \[(Cmd|Ctrl) K\]/)).length,
	).toBeGreaterThan(0);
	await user.click(button);
	expect(openSearch).toHaveBeenCalledOnce();
});
