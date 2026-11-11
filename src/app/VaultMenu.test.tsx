// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { VaultMenu, type VaultMenuProps } from "./VaultMenu";

afterEach(cleanup);

function setup(overrides: Partial<VaultMenuProps> = {}) {
	const props: VaultMenuProps = {
		vault: "Mikoshi Notes",
		busy: false,
		hasVault: true,
		maintainer: false,
		onChooseVault: vi.fn(),
		onOpenResources: vi.fn(),
		onOpenTemplates: vi.fn(),
		onOpenTrash: vi.fn(),
		onShowMaintainer: vi.fn(),
		onOpenSettings: vi.fn(),
		...overrides,
	};
	render(
		<TooltipProvider>
			<VaultMenu {...props} />
		</TooltipProvider>,
	);
	return { props, user: userEvent.setup() };
}

it("opens a menu with change vault, the managers and trash, each running its action", async () => {
	const { props, user } = setup();
	for (const [name, handler] of [
		["Change vault…", props.onChooseVault],
		["Resource manager", props.onOpenResources],
		["Template manager", props.onOpenTemplates],
		["Trash", props.onOpenTrash],
	] as const) {
		await user.click(
			screen.getByRole("button", { name: "Vault menu: Mikoshi Notes" }),
		);
		await user.click(await screen.findByRole("menuitem", { name }));
		expect(handler).toHaveBeenCalledOnce();
	}
	expect(screen.queryByRole("menuitem", { name: "Developer" })).toBeNull();
});

it("offers only opening a vault when none is open, and Developer only to the maintainer", async () => {
	const { user } = setup({ vault: null, hasVault: false, maintainer: true });
	await user.click(
		screen.getByRole("button", { name: "Vault menu: no vault open" }),
	);
	expect(await screen.findByRole("menuitem", { name: "Open a vault…" }));
	expect(screen.queryByRole("menuitem", { name: "Trash" })).toBeNull();
	expect(screen.getByRole("menuitem", { name: "Developer" })).toBeTruthy();
});

it("opens settings from the gear beside the menu", async () => {
	const { props, user } = setup();
	await user.click(screen.getByRole("button", { name: "Settings" }));
	expect(props.onOpenSettings).toHaveBeenCalledOnce();
});
