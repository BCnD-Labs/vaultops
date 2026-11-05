// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { ShellNavigation } from "./AppShell";
import { SearchButton } from "./SearchButton";

afterEach(cleanup);

it("is named Find or create a note, shows the key hint, and asks the shell to open the dialog", async () => {
	const openSearch = vi.fn();
	const user = userEvent.setup();
	render(
		<ShellNavigation.Provider
			value={{
				tags: 0,
				changes: 0,
				newFolder: 0,
				toolsVisible: true,
				propertyRequest: null,
				openProperties: () => {},
				openSearch,
			}}
		>
			<SearchButton />
		</ShellNavigation.Provider>,
	);
	const button = screen.getByRole("button", { name: "Find or create a note" });
	expect(button.textContent).toContain("Find or create a note...");
	expect(button.textContent).toMatch(/\[(Cmd|Ctrl) K\]/);
	await user.click(button);
	expect(openSearch).toHaveBeenCalledOnce();
});
