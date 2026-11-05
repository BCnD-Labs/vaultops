// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import { HostError } from "../host/host";
import { MemoryHost } from "../host/memory-host";
import { UpdateSection } from "./UpdateSection";

afterEach(cleanup);

const updateButton = () =>
	screen.getByRole("button", { name: "Update VaultOps" }) as HTMLButtonElement;

async function pressUpdate(user: ReturnType<typeof userEvent.setup>) {
	await user.click(updateButton());
	await user.click(screen.getByRole("button", { name: "Update now" }));
}

it("starts nothing when it opens, and nothing until Update now is pressed", async () => {
	const user = userEvent.setup();
	const host = new MemoryHost();
	render(<UpdateSection host={host} pollMs={10} />);
	expect(host.updateScriptStarts).toBe(0);

	await user.click(updateButton());
	// It asks first, saying what will happen.
	expect(
		screen.getByText(/saves your note, closes and opens again/),
	).toBeTruthy();
	expect(host.updateScriptStarts).toBe(0);

	await user.click(screen.getByRole("button", { name: "Cancel" }));
	expect(screen.queryByText(/saves your note/)).toBeNull();
	expect(host.updateScriptStarts).toBe(0);
});

it("starts the script after Update now and follows what it says", async () => {
	const user = userEvent.setup();
	const host = new MemoryHost();
	render(<UpdateSection host={host} pollMs={10} />);
	await pressUpdate(user);
	expect(host.updateScriptStarts).toBe(1);
	expect(await screen.findByText(/Updating/)).toBeTruthy();
	expect(updateButton().disabled).toBe(true);

	host.updateScript = { state: "running", lastLine: "Building VaultOps.app" };
	expect(await screen.findByText(/Building VaultOps\.app/)).toBeTruthy();
});

it("shows a failed run with its last line and lets it be tried again", async () => {
	const user = userEvent.setup();
	const host = new MemoryHost();
	render(<UpdateSection host={host} pollMs={10} />);
	await pressUpdate(user);
	host.updateScript = {
		state: "failed",
		lastLine: "The app build failed; the installed app was not changed.",
	};
	expect(await screen.findByText(/The update did not finish/)).toBeTruthy();
	expect(screen.getByText(/The app build failed/)).toBeTruthy();
	expect(updateButton().disabled).toBe(false);

	await pressUpdate(user);
	expect(host.updateScriptStarts).toBe(2);
	expect(await screen.findByText(/Updating/)).toBeTruthy();
});

it("says when the update finished", async () => {
	const user = userEvent.setup();
	const host = new MemoryHost();
	render(<UpdateSection host={host} pollMs={10} />);
	await pressUpdate(user);
	host.updateScript = { state: "finished", lastLine: "Installed VaultOps" };
	expect(await screen.findByText(/The update finished/)).toBeTruthy();
});

it("shows a run that is already going when Settings opens", async () => {
	const host = new MemoryHost();
	host.updateScript = {
		state: "running",
		lastLine: "Installing dependencies...",
	};
	render(<UpdateSection host={host} pollMs={10} />);
	expect(await screen.findByText(/Installing dependencies/)).toBeTruthy();
	expect(updateButton().disabled).toBe(true);
	expect(host.updateScriptStarts).toBe(0);
});

it("says plainly why an update could not start, and stays usable", async () => {
	const user = userEvent.setup();
	const host = new MemoryHost();
	host.nextUpdateScriptError = new HostError(
		"not-found",
		"the update script was not found in the code folder this app was built from",
	);
	render(<UpdateSection host={host} pollMs={10} />);
	await pressUpdate(user);
	expect(
		await screen.findByText(
			/Could not start the update: the update script was not found/,
		),
	).toBeTruthy();
	expect(updateButton().disabled).toBe(false);
	expect(screen.queryByText(/Updating/)).toBeNull();
});
