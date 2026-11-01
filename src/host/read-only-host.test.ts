import { describe, expect, it } from "vitest";
import { HostError } from "./host";
import { MemoryHost } from "./memory-host";
import { READ_ONLY_VAULT_MESSAGE, readOnlyHost } from "./read-only-host";

describe("readOnlyHost", () => {
	it("refuses every write to the vault with a clear error and changes nothing", async () => {
		const inner = new MemoryHost();
		await inner.makeFolder("Class");
		await inner.writeTextAtomic("Class/a.vnote", "A");
		const host = readOnlyHost(inner);

		const refused = [
			host.writeTextAtomic("Class/a.vnote", "B"),
			host.writeTextAtomic("new.vnote", "B"),
			host.move("Class/a.vnote", "b.vnote"),
			host.makeFolder("Other"),
			host.removeTrashed(".vaultops/trash/t/a.vnote"),
		];
		for (const call of refused) {
			await expect(call).rejects.toMatchObject({
				name: "HostError",
				code: "io",
				message: READ_ONLY_VAULT_MESSAGE,
			});
			await expect(call).rejects.toBeInstanceOf(HostError);
		}
		expect(await inner.readText("Class/a.vnote")).toBe("A");
		expect((await inner.list("")).map((e) => e.name)).toEqual(["Class"]);
	});

	it("still reads, and still writes the app's own files, log and reports", async () => {
		const inner = new MemoryHost();
		await inner.writeTextAtomic("a.vnote", "A");
		const host = readOnlyHost(inner);

		expect(await host.readText("a.vnote")).toBe("A");
		expect(await host.list("")).toEqual([{ name: "a.vnote", kind: "file" }]);
		expect(await host.kindOf("a.vnote")).toBe("file");
		expect(await host.currentVault()).toBe("Memory vault");

		await host.appendLog("line\n");
		await host.writeAppFile("session.json", "{}");
		await host.chooseReportsFolder();
		await host.writeReport("r.txt", "report");
		expect(inner.logLines).toEqual(["line\n"]);
		expect(await inner.readAppFile("session.json")).toBe("{}");
		expect(inner.reports.get("r.txt")).toBe("report");
	});
});
