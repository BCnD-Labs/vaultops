import { expect, it } from "vitest";
import { MemoryHost } from "./memory-host";
import { readOnlyHost } from "./read-only-host";

it("reports history off until it is turned on, then what changed since the last save point", async () => {
	const host = new MemoryHost();
	await host.writeTextAtomic("a.vnote", "one");
	expect(await host.vcs.status()).toEqual({
		enabled: false,
		branch: null,
		changes: [],
	});
	host.enableHistory();
	expect((await host.vcs.status()).changes).toEqual([
		{ path: "a.vnote", kind: "untracked" },
	]);
	host.saveAll();
	expect((await host.vcs.status()).changes).toEqual([]);
	await host.writeTextAtomic("a.vnote", "two");
	await host.writeTextAtomic("b.vnote", "new");
	await host.makeFolder("Notes");
	await host.move("a.vnote", "Notes/a.vnote");
	expect(await host.vcs.status()).toEqual({
		enabled: true,
		branch: "main",
		changes: [
			{ path: "a.vnote", kind: "deleted" },
			{ path: "b.vnote", kind: "untracked" },
			{ path: "Notes/a.vnote", kind: "untracked" },
		],
	});
});

it("can say git is missing, and a read-only vault still reads its history", async () => {
	const host = new MemoryHost();
	host.gitInfo = { found: false, version: null, needsDeveloperTools: true };
	const ro = readOnlyHost(host);
	expect(await ro.vcs.detect()).toEqual({
		found: false,
		version: null,
		needsDeveloperTools: true,
	});
	expect((await ro.vcs.status()).enabled).toBe(false);
});
