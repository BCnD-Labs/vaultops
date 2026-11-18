// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { MemoryHost } from "../host/memory-host";
import { AppearanceProvider } from "./AppearanceContext";
import { TagIndex } from "./TagBrowser";

afterEach(cleanup);

const rows = [
	{ path: "a.vnote", title: "A", tags: ["work/clients/acme", "idea"] },
	{ path: "b.vnote", title: "B", tags: ["work/clients/zed"] },
	{ path: "c.vnote", title: "C", tags: ["work"] },
];

function show(
	active: string | null,
	extra: Partial<Parameters<typeof TagIndex>[0]> = {},
) {
	const onPick = vi.fn();
	render(
		<AppearanceProvider host={new MemoryHost()}>
			<TagIndex rows={rows} active={active} onPick={onPick} {...extra} />
		</AppearanceProvider>,
	);
	return onPick;
}

it("shows parents with counts, opens and closes them, and picks a child by its full tag", async () => {
	const user = userEvent.setup();
	const onPick = show(null);
	expect(screen.getByRole("button", { name: /#work/ }).textContent).toContain(
		"3",
	);
	expect(screen.queryByRole("button", { name: /#clients/ })).toBeNull();
	await user.click(screen.getByRole("button", { name: "Toggle tag work" }));
	expect(
		screen.getByRole("button", { name: /#clients/ }).textContent,
	).toContain("2");
	await user.click(
		screen.getByRole("button", { name: "Toggle tag work/clients" }),
	);
	await user.click(screen.getByRole("button", { name: /#acme/ }));
	expect(onPick).toHaveBeenCalledWith("work/clients/acme");
	await user.click(screen.getByRole("button", { name: "Toggle tag work" }));
	expect(screen.queryByRole("button", { name: /#clients/ })).toBeNull();
});

it("opens with the arrow keys and starts open down to the picked tag", async () => {
	const user = userEvent.setup();
	show("work/clients/acme");
	expect(screen.getByRole("button", { name: /#acme/ })).toBeTruthy();
	await user.click(screen.getByRole("button", { name: /#idea/ }));
	await user.keyboard("{ArrowDown}");
	const work = screen.getByRole("button", { name: /#work/ });
	expect(document.activeElement).toBe(work);
	await user.keyboard("{ArrowLeft}");
	expect(screen.queryByRole("button", { name: /#clients/ })).toBeNull();
	await user.keyboard("{ArrowRight}");
	expect(screen.getByRole("button", { name: /#clients/ })).toBeTruthy();
});

it("renames after a confirmation that counts the notes that will change", async () => {
	const user = userEvent.setup();
	const onRename = vi.fn(async () => "2 notes updated.");
	show("work/clients", { onRename });
	await user.click(screen.getByRole("button", { name: /Rename or merge/ }));
	const name = screen.getByRole("textbox", { name: "New tag name" });
	await user.clear(name);
	await user.type(name, "clients");
	await user.click(screen.getByRole("button", { name: "Continue" }));
	expect(await screen.findByText("2 notes will change.")).toBeTruthy();
	expect(onRename).not.toHaveBeenCalled();
	await user.click(screen.getByRole("button", { name: "Rename" }));
	expect(onRename).toHaveBeenCalledWith("work/clients", "clients");
	expect(await screen.findByText("2 notes updated.")).toBeTruthy();
});
