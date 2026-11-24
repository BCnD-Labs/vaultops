import { expect, it } from "vitest";
import { MemoryHost } from "./memory-host";
import { readOnlyHost } from "./read-only-host";

it("reports history off until it is turned on, then what changed since the last save point", async () => {
	const host = new MemoryHost();
	await host.writeTextAtomic("a.vnote", "one");
	expect(await host.vcs.status()).toEqual({
		enabled: false,
		otherRepo: false,
		syncedFolder: null,
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
		otherRepo: false,
		syncedFolder: null,
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

it("turns history on with a first save point, and refuses twice or someone else's repo", async () => {
	const host = new MemoryHost();
	await host.writeTextAtomic("a.vnote", "one");
	const on = await host.vcs.enable("  Sam   Rivera ");
	expect(on).toMatchObject({ enabled: true, branch: "main", changes: [] });
	expect(host.historyAuthor).toBe("Sam Rivera");
	await expect(host.vcs.enable("Sam")).rejects.toMatchObject({
		code: "invalid-argument",
	});
	const other = new MemoryHost();
	other.otherRepo = true;
	await expect(other.vcs.enable("Sam")).rejects.toMatchObject({
		message: expect.stringContaining("already is a git repository"),
	});
	await expect(
		readOnlyHost(new MemoryHost()).vcs.enable("Sam"),
	).rejects.toThrow(/read-only/);
});

it("makes save points of everything or chosen files, and nothing when nothing changed", async () => {
	const host = new MemoryHost();
	await host.writeTextAtomic("a.vnote", "1");
	await host.vcs.enable("Sam");
	expect((await host.vcs.savePoint("x")).saved).toBe(false);
	await host.writeTextAtomic("a.vnote", "2");
	await host.writeTextAtomic("b.vnote", "new");
	const onlyB = await host.vcs.savePoint("Just b", ["b.vnote"]);
	expect(onlyB.saved).toBe(true);
	expect(onlyB.status.changes).toEqual([{ path: "a.vnote", kind: "modified" }]);
	await host.vcs.savePoint("  ");
	expect(host.historyLog).toEqual([
		"History turned on",
		"Just b",
		"Save point",
	]);
	await expect(host.vcs.savePoint("x", [])).rejects.toMatchObject({
		code: "invalid-argument",
	});
});

it("lists save points newest first, in pages and per file", async () => {
	const host = new MemoryHost();
	await host.writeTextAtomic("a.vnote", "1");
	await host.vcs.enable("Sam");
	await host.writeTextAtomic("a.vnote", "2");
	await host.vcs.savePoint("Edited a\n\nMore");
	await host.writeTextAtomic("b.vnote", "new");
	await host.vcs.savePoint("Added b");
	const all = await host.vcs.log({ skip: 0, limit: 50 });
	expect(all.entries.map((e) => e.subject)).toEqual([
		"Added b",
		"Edited a",
		"History turned on",
	]);
	expect(all.entries[1]).toMatchObject({
		body: "More",
		author: "Sam",
		filesChanged: 1,
	});
	expect(all.entries[1]?.parents).toEqual([all.entries[2]?.id]);
	const page = await host.vcs.log({ skip: 1, limit: 1 });
	expect(page).toMatchObject({
		hasMore: true,
		entries: [{ subject: "Edited a" }],
	});
	const ofA = await host.vcs.log({ path: "a.vnote", skip: 0, limit: 50 });
	expect(ofA.entries.map((e) => e.subject)).toEqual([
		"Edited a",
		"History turned on",
	]);
});
