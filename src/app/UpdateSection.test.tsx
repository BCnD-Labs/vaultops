// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import { HostError, type UpdateChannel } from "../host/host";
import { MemoryHost } from "../host/memory-host";
import { relativeTime, UpdateSection } from "./UpdateSection";

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

const SHA_A = "a".repeat(40);
const SHA_B = "b".repeat(40);

function channel(sha: string, subject: string, minutesAgo: number) {
	return {
		exists: true,
		commit: sha,
		shortCommit: sha.slice(0, 7),
		committedAt: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
		subject,
	} satisfies UpdateChannel;
}

const rowText = (name: string) =>
	screen.getByText(new RegExp(`^${name}`)).parentElement?.textContent ?? "";

it("says what is running and checks GitHub when it opens", async () => {
	const host = new MemoryHost();
	host.build = {
		branch: "main",
		commit: SHA_A,
		builtAt: "2026-11-17T12:00:00Z",
	};
	host.channels.main = channel(SHA_A, "feat: latest on main", 120);
	render(<UpdateSection host={host} pollMs={10} />);
	expect(
		await screen.findByText(/Running now: Main · aaaaaaa · built 17 Nov/),
	).toBeTruthy();
	expect(host.updateChecks).toBe(1);
	expect(await screen.findByText(/Checked at \d\d:\d\d/)).toBeTruthy();
	expect(rowText("Main")).toContain(
		"aaaaaaa · feat: latest on main · 2 hours ago",
	);
});

it("marks the running branch up to date, or as having an update", async () => {
	const host = new MemoryHost();
	host.build = { branch: "main", commit: SHA_A, builtAt: "" };
	host.channels.main = channel(SHA_A, "same", 5);
	render(<UpdateSection host={host} pollMs={10} />);
	await screen.findByText(/Running now/);
	expect(rowText("Main")).toContain("Up to date");

	host.channels.main = channel(SHA_B, "newer", 1);
	await userEvent
		.setup()
		.click(screen.getByRole("button", { name: "Check for updates" }));
	await screen.findByText(/newer/);
	expect(rowText("Main")).toContain("Update available");
	expect(host.updateChecks).toBe(2);
});

it("marks the other branch not installed, and a missing branch not set up yet", async () => {
	const host = new MemoryHost();
	host.build = { branch: "develop", commit: SHA_A, builtAt: "" };
	host.channels.develop = channel(SHA_A, "dev work", 30);
	render(<UpdateSection host={host} pollMs={10} />);
	await screen.findByText(/Running now: Development/);
	expect(rowText("Main")).toContain("Not installed");
	expect(rowText("Development")).toContain("Up to date");
	cleanup();

	const fresh = new MemoryHost();
	render(<UpdateSection host={fresh} pollMs={10} />);
	await screen.findByText(/Running now/);
	expect(rowText("Development")).toContain("Not set up yet");
});

it("treats a build with no recorded branch as not installed on either row", async () => {
	const host = new MemoryHost();
	host.build = { branch: "unknown", commit: "unknown", builtAt: "unknown" };
	host.channels.develop = channel(SHA_B, "dev work", 30);
	render(<UpdateSection host={host} pollMs={10} />);
	expect(
		await screen.findByText(/Running now: a development build/),
	).toBeTruthy();
	expect(rowText("Main")).toContain("Not installed");
	expect(rowText("Development")).toContain("Not installed");
});

it("shows a failed check inline, with the last known commits, never as a toast", async () => {
	const host = new MemoryHost();
	host.channels.error = "Could not resolve host: github.com";
	render(<UpdateSection host={host} pollMs={10} />);
	const alert = await screen.findByRole("alert");
	expect(alert.textContent).toContain("Could not resolve host");
	expect(rowText("Main")).toContain("feat: latest on main");
	expect(
		(
			screen.getByRole("button", {
				name: "Check for updates",
			}) as HTMLButtonElement
		).disabled,
	).toBe(false);
});

it("says so when the check itself cannot run", async () => {
	const host = new MemoryHost();
	host.updateChannels = () =>
		Promise.reject(new HostError("io", "no permission"));
	render(<UpdateSection host={host} pollMs={10} />);
	expect((await screen.findByRole("alert")).textContent).toContain(
		"no permission",
	);
});

it("writes times as minutes, hours and days ago", () => {
	const now = Date.parse("2026-11-17T12:00:00Z");
	const ago = (minutes: number) =>
		relativeTime(new Date(now - minutes * 60_000).toISOString(), now);
	expect(ago(0)).toBe("just now");
	expect(ago(1)).toBe("1 minute ago");
	expect(ago(59)).toBe("59 minutes ago");
	expect(ago(60)).toBe("1 hour ago");
	expect(ago(26 * 60)).toBe("1 day ago");
	expect(ago(3 * 24 * 60)).toBe("3 days ago");
	expect(relativeTime("nonsense", now)).toBe("");
});
