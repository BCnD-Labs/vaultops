// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { MemoryHost } from "../host/memory-host";
import { SavePointActions } from "./SavePointActions";

afterEach(cleanup);

async function vault() {
	const host = new MemoryHost();
	await host.writeTextAtomic("a.vnote", "one");
	await host.vcs.enable("Sam");
	await host.writeTextAtomic("b.vnote", "added");
	await host.vcs.savePoint("Added b");
	await host.writeTextAtomic("a.vnote", "two");
	await host.writeTextAtomic("New.vnote", "new");
	await host.vcs.savePoint("Later");
	const log = (await host.vcs.log({ skip: 0, limit: 10 })).entries;
	return { host, log };
}

it("restores the vault to a save point, moving newer notes to the trash when ticked", async () => {
	const user = userEvent.setup();
	const { host, log } = await vault();
	const first = log.at(-1);
	if (!first) throw new Error("no history");
	const onChanged = vi.fn();
	render(<SavePointActions host={host} entry={first} onChanged={onChanged} />);
	await user.click(
		screen.getByRole("button", { name: "Actions for History turned on" }),
	);
	await user.click(
		await screen.findByRole("button", {
			name: "Restore vault to this save point…",
		}),
	);
	await user.click(screen.getByRole("checkbox"));
	await user.click(screen.getByRole("button", { name: "Restore vault" }));
	expect(onChanged.mock.calls[0]?.[0]).toMatch(
		/Restored the vault .* 2 newer note\(s\) moved to the trash\./,
	);
	expect(await host.readText("a.vnote")).toBe("one");
	expect(await host.kindOf("New.vnote")).toBeNull();
	expect(host.historyLog.at(-1)).toMatch(/^Restored the vault to /);
});

it("undoes one save point, and explains when it can't", async () => {
	const user = userEvent.setup();
	const { host, log } = await vault();
	const added = log.find((e) => e.subject === "Added b");
	if (!added) throw new Error("no entry");
	const onChanged = vi.fn();
	render(<SavePointActions host={host} entry={added} onChanged={onChanged} />);
	await user.click(screen.getByRole("button", { name: "Actions for Added b" }));
	await user.click(
		await screen.findByRole("button", { name: "Undo this save point" }),
	);
	expect(onChanged).toHaveBeenCalledWith('Undid "Added b".');
	expect(await host.kindOf("b.vnote")).toBeNull();
	cleanup();
	const first = log.at(-1);
	if (!first) throw new Error("no history");
	render(<SavePointActions host={host} entry={first} onChanged={onChanged} />);
	await user.click(
		screen.getByRole("button", { name: "Actions for History turned on" }),
	);
	expect(
		(
			await screen.findByRole("button", { name: "Undo this save point" })
		).hasAttribute("disabled"),
	).toBe(true);
});

it("changes nothing when a note couldn't be saved first", async () => {
	const user = userEvent.setup();
	const { host, log } = await vault();
	const added = log.find((e) => e.subject === "Added b");
	if (!added) throw new Error("no entry");
	render(
		<SavePointActions
			host={host}
			entry={added}
			beforeChange={async () => false}
			onChanged={vi.fn()}
		/>,
	);
	await user.click(screen.getByRole("button", { name: "Actions for Added b" }));
	await user.click(
		await screen.findByRole("button", { name: "Undo this save point" }),
	);
	expect((await screen.findByRole("alert")).textContent).toContain(
		"nothing was changed",
	);
	expect(await host.readText("b.vnote")).toBe("added");
});
