import { expect, it } from "vitest";
import { MemoryHost } from "../../host/memory-host";
import { restoreVaultTo } from "./restore-vault";

async function vault() {
	const host = new MemoryHost();
	await host.writeTextAtomic("a.vnote", "one");
	await host.vcs.enable("Sam");
	const [first] = (await host.vcs.log({ skip: 0, limit: 1 })).entries;
	await host.writeTextAtomic("a.vnote", "two");
	await host.writeTextAtomic("New.vnote", "new");
	await host.vcs.savePoint("later");
	await host.writeTextAtomic("a.vnote", "unsaved");
	return { host, first: first as NonNullable<typeof first> };
}

it("restores old files, keeps newer ones, and saves unsaved work first", async () => {
	const { host, first } = await vault();
	const report = await restoreVaultTo(host, first, {
		trashNewer: false,
		label: "Nov 1",
	});
	expect(await host.readText("a.vnote")).toBe("one");
	expect(await host.readText("New.vnote")).toBe("new");
	expect(report.kept).toEqual(["New.vnote"]);
	expect(host.historyLog.slice(-2)).toEqual([
		"Before restoring the vault",
		"Restored the vault to Nov 1: History turned on",
	]);
	expect((await host.vcs.status()).changes).toEqual([]);
});

it("moves newer notes to the trash when asked, never deleting them", async () => {
	const { host, first } = await vault();
	const report = await restoreVaultTo(host, first, {
		trashNewer: true,
		label: "Nov 1",
	});
	expect(report.trashed).toEqual(["New.vnote"]);
	expect(await host.kindOf("New.vnote")).toBeNull();
	const trash = await host.list(".vaultops/trash");
	expect(trash).toHaveLength(1);
});
